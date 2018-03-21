"use strict";

const {NodeVM} = require("vm2");
const fs = require("fs");
const {PartialOrder} = require("po-utils");
const {TotalOrder} = require("to-utils");
const {auth} = require("auth");
const {SecureKV_PO} = require("secure-kv-po");
const {SecureKV_TO} = require("secure-kv-to");
const aws = require("aws-sdk");
const nodemailer = require("nodemailer");
const {fork, wait} = require('fork');
const got = require('got');
const fetch = require('node-fetch');
const {log} = require('logger');


const rmFilesInDir = function (dirPath) {
    try {
        const files = fs.readdirSync(dirPath);

        if (files.length > 0)
            for (let i = 0; i < files.length; i++) {
                const filePath = dirPath + '/' + files[i];
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
                else
                    rmFilesInDir(filePath);
            }
    }
    catch(e) { }
};

const notEmptyDir = function (dirPath) {
    try {
        const files = fs.readdirSync(dirPath);
        return files.length > 0;
    }
    catch(e) { return true; }
};

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));
const unsecuredLambda = fs.readFileSync(conf.unsecLambda, 'utf8');

const labelOrdering = conf.usingPO ? new PartialOrder(conf.labels) : new TotalOrder(conf.min, conf.max);

module.exports.makeShim = function (exp, allowExtReq) {

    // NodeVM configuration
    let label;
    let callbackSecurityBound;
    let labelHistory = [];
    let p;

    const processEnv = {};

    log('### Started shim construction', 3);

    for (let envVar of conf.processEnv) {
        processEnv[envVar] = process.env[envVar];
        log(`### Added environment variable ${envVar}, with value ${process.env[envVar]}`, 3);
    }

    log('### Creating executionEnv', 3);

    let executionEnv = {
        console: 'inherit',
        sandbox: {
            process: {
                env: processEnv,
            },
            bumpLabelTo:
                function (newLabel) {
                    if (labelOrdering.lte(label, newLabel)) {
                        labelHistory.push(label);
                        label = newLabel;
                        return true;
                    } else {
                        return false;
                    }
                },
            bumpLabelToTop:
                function () {
                    label = this.bumpLabelTo(labelOrdering.getTop());
                },
            getCurrentLabel:
                function () {
                    return label;
                }
        },
        require: {
            context: 'sandbox',
            external: allowExtReq,
            builtin: ['fs', 'url'],
            root: "./",
            mock: {
                'kv-store': {
                    KV_Store: function (h, u, pwd, tableName) {
                        const skv = conf.usingPO ?
                            new SecureKV_PO(conf.host, conf.user, conf.pass, labelOrdering, tableName) :
                            new SecureKV_TO(conf.host, conf.user, conf.pass, tableName);

                        return {
                            init: () => skv.init(),
                            close: () => skv.close(),
                            put: (k, v) => skv.put(k, v, label),
                            get: (k) => {
                                return skv.get(k, label)
                                    .then((res) => {
                                        if (res.length > 0) {
                                            return res[0].rowvalues;
                                        } else {
                                            return res;
                                        }
                                    }); // Arbitrary choice (?)
                            },
                            del: (k) => skv.del(k, label),
                            keys: () => skv.keys(label),
                            entries: () => skv.entries(label)
                                .then(entries => {
                                    let filteredEntries = [];

                                    for (let entry of entries) {
                                        let entryMax = true;
                                        for (let compared of entries) {
                                            if (entry.key === compared.key &&
                                                entry.lab !== compared.lab &&
                                                labelOrdering.lte(entry.lab, compared.lab)) {
                                                entryMax = false;
                                            }
                                        }
                                        if (entryMax) {
                                            filteredEntries.push(entry);
                                        }
                                    }
                                    return filteredEntries;
                                }),
                        }
                    }
                },
                'aws-sdk': {
                    config: aws.config,

                    Kinesis: function () {
                        const kinesis = new aws.Kinesis();
                        return {
                            putRecord: (event, callback) => {
                                const data = JSON.parse(event.Data);
                                if (data.ifcLabel) { // && event.Data.ifcLabel !== label) {
                                    throw `Unexpected security label. Event written to kinesis should not have an ifcLabel field. Has label: ${data.ifcLabel}`;
                                } else if (data.callbackSecurityBound) {
                                    throw `Unexpected security bound. Event written to kinesis should not have a callbackSecurityBound field. Has label: ${data.callbackSecurityBound}`;
                                } else {
                                    data.ifcLabel = label;
                                    data.callbackSecurityBound = callbackSecurityBound;

                                    event.Data = JSON.stringify(data);
                                    return kinesis.putRecord(event, callback);
                                }
                            },
                        }
                    },

                    StepFunctions: function () {
                        const stepfunctions = new aws.StepFunctions();
                        return {
                            startExecution: (params, callback) => {
                                // Can add additional security measures here.
                                // e.g. check the stream name against a valid stream name in the configuration.

                                const transParams = params;
                                const input = JSON.parse(params.input);
                                input.ifcLabel = label;
                                input.callbackSecurityBound = callbackSecurityBound;
                                transParams.input = JSON.stringify(input);
                                return stepfunctions.startExecution(transParams, callback);
                            },
                            getActivityTask: (params, callback) => stepfunctions.getActivityTask(params, callback),
                            sendTaskFailure: (params, callback) => stepfunctions.sendTaskFailure(params, callback),
                            sendTaskSuccess: (params, callback) => stepfunctions.sendTaskSuccess(params, callback),
                        }
                    },

                    Rekognition: function () {
                        return new aws.Rekognition();

                        // NOTE: Might want to uncomment this code, to secure outgoing call to rekognition.
                        // return {
                        //     detectLabels: function (params, callback) {
                        //         if (labelOrdering.lte(label, callbackSecurityBound)) {
                        //             return rek.detectLabels(params, callback);
                        //         } else {
                        //             return callback("Attempting to call detectLabels in violation with security policy");
                        //         }
                        //     }
                        // }
                    },
                },
                'nodemailer' : {
                    createTransport: (params) => {
                        const mailer = nodemailer.createTransport(params);

                        return {
                            sendMail: (mailOptions) => {
                                let nmSecLabel;
                                if (conf.securityBounds &&
                                    conf.securityBounds.nodemailer) {
                                    nmSecLabel = conf.securityBounds.nodemailer;
                                } else {
                                    nmSecLabel = "bottom";
                                }
                                if (conf.declassifiers &&
                                    conf.declassifiers.nodemailer &&
                                    labelOrdering.lte(label, conf.declassifiers.nodemailer.maxLabel) &&
                                    labelOrdering.lte(conf.declassifiers.nodemailer.minLabel, nmSecLabel)) {

                                    mailer.sendMail(eval(conf.declassifiers.nodemailer.code)(mailOptions));

                                } else if (labelOrdering.lte(label, nmSecLabel)) {
                                    return mailer.sendMail(mailOptions);
                                } else {
                                    throw "Attempting to send in violation with security policy"
                                }

                            }
                        }
                    },
                    getTestMessageUrl: (info) => nodemailer.getTestMessageUrl(info),
                },
                'got' : {
                    get: (uri, params) => {
                        let gotSecLabel;
                        if (conf.securityBounds &&
                            conf.securityBounds.got) {
                            gotSecLabel = conf.securityBounds.got;
                        } else {
                            gotSecLabel = 'bottom';
                        }
                        if (conf.declassifiers &&
                            conf.declassifiers.got &&
                            labelOrdering.lte(label, conf.declassifiers.got.maxLabel) &&
                            labelOrdering.lte(conf.declassifiers.got.minLabel, gotSecLabel)) {
                            return got.get(eval(conf.declassifiers.got.uri)(uri), eval(conf.declassifiers.got.params)(params));
                        } else if (labelOrdering.lte(label, gotSecLabel)) {
                            return got.get(uri, params);
                        } else {
                            return Promise.reject("Attempting to access a url in violation with security policy");
                        }
                    }
                },
                'node-fetch' : (params) => {
                    let nodeFetchSecLabel;
                    if (conf.securityBounds &&
                        conf.securityBounds.nodeFetch) {
                        nodeFetchSecLabel = conf.securityBounds.nodeFetch;
                    } else {
                        nodeFetchSecLabel = 'bottom';
                    }
                    if (conf.declassifiers &&
                        conf.declassifiers.nodeFetch &&
                        labelOrdering.lte(label, conf.declassifiers.nodeFetch.maxLabel) &&
                        labelOrdering.lte(conf.declassifiers.nodeFetch.minLabel, nodeFetchSecLabel)) {
                        return fetch(eval(conf.declassifiers.nodeFetch.params)(params));
                    } else if (labelOrdering.lte(label, nodeFetchSecLabel)) {
                        return fetch(params);
                    } else {
                        return Promise.reject("Attempting to access a url in violation with security policy");
                    }
                }
            }
        },
    };

    log('### Finished creating executionEnv', 3);

    log('### Creating NodeVM', 3);

    const vm = new NodeVM(executionEnv);

    log('### Executing unsecured lambda in vm', 3);

    const vm_module = vm.run(unsecuredLambda, conf.secLambdaFullPath);

    log('### Finished execution of original lambda code within vm scope', 3);
    log('### Created a vm_module:', 3);
    log(vm_module, 3);

    for (let handlerName of conf.handlers) {

        exp[handlerName] = function (event, context, callback) {
            log(`$$$ Calling handler ${handlerName} in lambda-shim.js`, 2);
            log('$$$ Event is:', 2);
            log(event, 2);
            log('$$$ $$$', 2);

            log ('$$$ Forking the process', 2);
            const isChild = fork();
            log ('$$$ Forked the process', 2);

            if (isChild) {
                log('$#$ Running in child in lambda-shim.js', 2);
                // Parse event + context

                const strippedEvent = event;
                if (conf.runFromKinesis) { // Handle events originating from AWS Kinesis.
                    log('$#$ Event originated in AWS Kinesis', 3);

                    let ifcLabel;
                    let storedSecurityBound;
                    log('$#$ Getting a process label from Kinesis event record, and stripping event records of label information.', 3);
                    strippedEvent.Records = event.Records.map((record) => {
                        log('$#$ Analyzing record: ', 4);
                        log(record, 4);

                        const payload = new Buffer(record.kinesis.data, 'base64').toString();
                        log(`$#$ Record payload is: \n$#$ ${payload}`, 4);

                        log('$#$ Attempting to parse the payload as a JSON object ', 4);
                        const parsed = JSON.parse(payload);
                        log('$#$ Parsed payload: ', 4);
                        log(parsed, 4);

                        if (!ifcLabel) {
                            ifcLabel = parsed.ifcLabel;
                            log(`$#$ First label encountered. New label is ${ifcLabel} `, 4);
                        } else if (ifcLabel !== parsed.ifcLabel) {
                            log("$#$ Encoutered a batch of kinesis event with different labels. \nTerminating.", 1);
                            return callback("Batch of kinesis event with different labels unsupported.");
                        }
                        delete parsed.ifcLabel;
                        log('$#$ Removed ifcLabel from the parsed payload', 4);

                        if (!storedSecurityBound) {
                            storedSecurityBound = parsed.callbackSecurityBound;
                            log(`$#$ First security bound encountered. New security bound is ${storedSecurityBound} `, 4);
                        } else if (storedSecurityBound !== parsed.callbackSecurityBound) {
                            log("$#$ Encountered a batch of kinesis event with different security bounds. \n Terminating.", 1);
                            return callback("Batch of kinesis event with different security bounds unsupported.");
                        }
                        delete parsed.callbackSecurityBound;
                        log('$#$ Removed callbackSecurityBound from the parsed payload', 4);

                        log('$#$ Processed record is: ',4);
                        log(parsed, 4);

                        record.kinesis.data = new Buffer(JSON.stringify(parsed)).toString('base64');
                        log(`$#$ Rewriting the kinesis.data field of the record with the processed payload.\n$#$ New payload is ${record.kinesis.data}`, 4);

                        return record;
                    });

                    if (!ifcLabel) {
                        log("$#$ Could not resolve an ifcLabel in kinesis event.", 1);
                        return callback("Could not resolve an ifcLabel in kinesis event.")
                    }
                    if (!storedSecurityBound) {
                        log("$#$ Could not resolve a callbackSecurityBound in kinesis event.", 1);
                        return callback("Could not resolve a callbackSecurityBound in kinesis event.")
                    }

                    log(`$#$ Running kinesis event with label: ${ifcLabel}`, 1);

                    callbackSecurityBound = storedSecurityBound;
                    log(`$#$ Running kinesis event with callbackSecurityBound: ${callbackSecurityBound}`, 1);

                    p = Promise.resolve(ifcLabel);

                    log('$#$ Initiated the promise with the ifc value derived from the Kinesis event.', 3);
                } else if (conf.runFromSF /* && event.ifcLabel*/) { // Handle events originating from AWS Step Functions.
                    log('$#$ Event originated in AWS Step Functions', 3);

                    const sfLabel = event.ifcLabel;

                    log(`$#$ Derived label is ${sfLabel}`, 3);

                    delete strippedEvent.ifcLabel;

                    log('$#$ Removed label from event', 3);


                    callbackSecurityBound = event.callbackSecurityBound;

                    log(`$#$ Derived security bound is ${callbackSecurityBound}`, 3);

                    delete strippedEvent.callbackSecurityBound;

                    log('$#$ Removed security bound from event', 3);
                    log('$#$ Stripped event is: ', 3);
                    log(strippedEvent, 3);

                    p = Promise.resolve(sfLabel);

                    log('$#$ Initiated the promise with the ifc value derived from the Step Function event.', 3);
                } else {

                    log('$#$ Event originated in an HTTP request', 3);

                    let reqUser;
                    let reqPass;

                    if (conf.runFromGET) { // Run http GET request on behalf of invoking user.
                        log('$#$ Event is a GET request', 3);
                        reqUser = event.queryStringParameters.user;
                        reqPass = event.queryStringParameters.pass;
                        log(`$#$ Request username is ${reqUser}, and password is ${reqPass}`, 3);
                        if (conf.userPassForIFCOnly) {
                            log('$#$ Function configured to purge username and password before passing them to the sandbox.', 3);
                            delete event.queryStringParameters.user;
                            delete event.queryStringParameters.pass;
                        }
                    } else { // Run http POST request on behalf of invoking user.
                        log('$#$ Event is a POST request', 3);

                        let reqBody;
                        if ((typeof event.body) === "string") {
                            log('$#$ Request body is a string', 3);
                            reqBody = JSON.parse(event.body);
                        } else {
                            log('$#$ Request body is a JSON object', 3);
                            reqBody = event.body;
                        }

                        log('$#$ Request body is:', 3);
                        log(reqBody, 3);

                        reqUser = reqBody.user;
                        reqPass = reqBody.pass;

                        log(`$#$ Request username is ${reqUser}, and password is ${reqPass}`, 3);
                    }

                    p = auth(reqUser, reqPass);

                    log('$#$ Initiated the promise with the ifc value derived from a call to the authentication module with the derived credentials.', 3);
                }

                log('$#$ Creating the secure callback function.', 3);

                let secureCallback = function (err, value) {
                    log('$#$ Executing secureCallback.', 3);
                    log('$#$ Error is: ', 3);
                    log(err, 3);
                    log('$#$ Value is: ', 3);
                    log(value, 3);

                    if (conf.runFromSF) { // Add label to the callback to the stepfunction, which in turn becomes the input to the next lambda.
                        log('$#$ Function executed from StepFunctions. Adding label and security bound to callback value.', 3);
                        if (value) {
                            value.ifcLabel = label;
                            value.callbackSecurityBound = callbackSecurityBound;
                        }
                        if (conf.declassifiers &&
                            conf.declassifiers.callback &&
                            labelOrdering.lte(label, conf.declassifiers.callback.maxLabel) &&
                            labelOrdering.lte(conf.declassifiers.callback.minLabel, callbackSecurityBound)) {

                            log('$#$ Callback value and error message are going through a declassifier. Executing callback.', 3);

                            return callback(eval(conf.declassifiers.callback.errCode)(err), eval(conf.declassifiers.callback.valueCode)(value));
                        } else {
                            log('$#$ Executing callback.', 3);

                            return callback(err, value); // Not an external channel, no need to check against security label.
                        }
                    } else {
                        log('$#$ Function executed from HTTP or Kinesis.', 3);

                        if (conf.declassifiers &&
                            conf.declassifiers.callback &&
                            labelOrdering.lte(label, conf.declassifiers.callback.maxLabel) &&
                            labelOrdering.lte(conf.declassifiers.callback.minLabel, callbackSecurityBound)) {

                            log('$#$ Callback value and error message are going through a declassifier. Executing callback.', 3);

                            return callback(eval(conf.declassifiers.callback.errCode)(err),eval(conf.declassifiers.callback.valueCode)(value));

                        } else {
                            if (labelOrdering.lte(label, callbackSecurityBound)) {
                                log('$#$ Labels match security policy. Executing callback.', 3);

                                return callback(err, value);
                            } else {
                                log('$#$ Labels do not match security policy. Executing an empty callback.', 3);

                                return callback(null);
                            }
                        }
                    }
                };

                log('$#$ Created the secure callback function.', 3);

                if (notEmptyDir('/tmp/')) {
                    log("WARNING : /tmp/ dir not empty on fresh invocation of lambda. Might lead to data leak.", 0)
                }


                p.then((l) => {
                    log('$#$ Executing promise after having resolved the label.', 2);
                    log(`$#$ Label is ${l}.`, 2);

                    if (l === undefined) {
                        log('$#$ No label assigned. Running as bottom.', 2);
                        // In case getting the label failed, run on behalf of 'bottom' (completely unprivileged).
                        label = labelOrdering.getBottom();
                    } else {
                        log('$#$ Setting the resolved label to be the global label.', 2);
                        label = l;
                    }

                    log('$#$ Setting the security bound.', 2);
                    if (conf.callbackSecurityBound) { // Statically defined security bound
                        log(`$#$ Security bound is statically defined. The bound is ${conf.callbackSecurityBound}`, 2);
                        callbackSecurityBound = conf.callbackSecurityBound;
                    } else if (conf.runFromKinesis) { // Not entirely sure what callback security bounds mean in the context
                        log(`$#$ Running as a Kinesis event. Expecting security bound from the invoking event. Security bound is ${callbackSecurityBound}`, 2);
                        // of kinesis and step functions.
                        if (!callbackSecurityBound) {
                            log("Kinesis event with no security bound.", 1);
                            return callback("Kinesis event with no security bound.");
                        }
                    } else if (conf.runFromSF) {
                        log(`$#$ Running as a step functions event. Expect security bound from the invoking event. Security bound is ${callbackSecurityBound}`, 2);
                        if (!callbackSecurityBound) {
                            log("StepFunctions event with no security bound.", 1);
                            return callback("StepFunctions event with no security bound.");
                        }
                    } else { // Running an http request - the security bound is the same as the invoking user's label.
                        log(`$#$ Running as an HTTP request. Setting security bound to the requesting user's security label. Security bound is ${label}`, 2);
                        callbackSecurityBound = label;
                    }

                    log('$#$ Calling sandboxed handler as child in lambda-shim.js', 2);
                    vm_module[handlerName](strippedEvent, context, secureCallback);
                    // vm.run(originalLambdaScript, conf.secLambdaFullPath);
                })
                    .catch(err => {
                        log("$#$ Error in execution:", 1);
                        console.log(err)
                    });



            } else {
                log('$$# Running in parent in lambda-shim.js', 2);
                wait();
                log('$$# Finished wait as parent in lambda-shim.js', 2);
            }

        };
    }
};


