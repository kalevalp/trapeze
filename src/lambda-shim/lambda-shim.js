"use strict";

const {NodeVM,VMScript} = require("vm2");
const fs = require("fs");
const {PartialOrder} = require("po-utils");
const {TotalOrder} = require("to-utils");
const {auth} = require("auth");
const {SecureKV_PO} = require("secure-kv-po");
const {SecureKV_TO} = require("secure-kv-to");
const aws = require("aws-sdk");
const nodemailer = require("nodemailer");
const got = require('got');
const fetch = require('node-fetch');

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
    for (let handlerName of conf.handlers) {
        const originalLambdaScript = new VMScript(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports.${handlerName}(externalEvent, externalContext, externalCallback);
        `);


        exp[handlerName] = function (event, context, callback) {

            let label;
            let callbackSecurityBound;
            let labelHistory = [];

            let p;
            const strippedEvent = event;
            if (conf.runFromKinesis) { // Handle events originating from AWS Kinesis.

                let ifcLabel;
                let storedSecurityBound;
                strippedEvent.Records = event.Records.map((record) => {
                    const payload = new Buffer(record.kinesis.data, 'base64').toString();
                    const parsed = JSON.parse(payload);
                    if (!ifcLabel) {
                        ifcLabel = parsed.ifcLabel;
                    } else if (ifcLabel !== parsed.ifcLabel) {
                        console.log("Batch of kinesis event with different labels unsupported.");
                        return callback("Batch of kinesis event with different labels unsupported.");
                    }
                    delete parsed.ifcLabel;

                    if (!storedSecurityBound) {
                        storedSecurityBound = parsed.callbackSecurityBound;
                    } else if (storedSecurityBound !== parsed.callbackSecurityBound) {
                        console.log("Batch of kinesis event with different security bounds unsupported.");
                        return callback("Batch of kinesis event with different security bounds unsupported.");
                    }
                    delete parsed.callbackSecurityBound;

                    record.kinesis.data = new Buffer(JSON.stringify(parsed)).toString('base64');
                    return record;
                });

                if (!ifcLabel) {
                    console.log("Could not resolve an ifcLabel in kinesis event.")
                    return callback("Could not resolve an ifcLabel in kinesis event.")
                }
                if (!storedSecurityBound) {
                    console.log("Could not resolve a callbackSecurityBound in kinesis event.")
                    return callback("Could not resolve a callbackSecurityBound in kinesis event.")
                }

                console.log(`Running kinesis event with label: ${ifcLabel}`);

                callbackSecurityBound = storedSecurityBound;
                console.log(`Running kinesis event with callbackSecurityBound: ${callbackSecurityBound}`);

                p = Promise.resolve(ifcLabel);
            } else if (conf.runFromSF /* && event.ifcLabel*/) { // Handle events originating from AWS Step Functions.
                const sfLabel = event.ifcLabel;
                delete strippedEvent.ifcLabel;

                callbackSecurityBound = event.callbcakSecurityBound;
                delete strippedEvent.callbcakSecurityBound;

                p = Promise.resolve(sfLabel);
            } else {
                let reqUser;
                let reqPass;

                if (conf.runFromGET) { // Run http GET request on behalf of invoking user.
                    reqUser = event.queryStringParameters.user;
                    reqPass = event.queryStringParameters.pass;
                    if (conf.userPassForIFCOnly) {
                        delete event.queryStringParameters.user;
                        delete event.queryStringParameters.pass;
                    }
                } else { // Run http POST request on behalf of invoking user.
                    let reqBody;
                    if ((typeof event.body) === "string") {
                        reqBody = JSON.parse(event.body);
                    } else {
                        reqBody = event.body;
                    }
                    reqUser = reqBody.user;
                    reqPass = reqBody.pass;

                }
                p = auth(reqUser, reqPass);
            }
            const processEnv = {};

            for (let envVar of conf.processEnv) {
                processEnv[envVar] = process.env[envVar];
            }

            let executionEnv = {
                console: 'inherit',
                sandbox: {
                    process: {
                        env: processEnv,
                    },
                    externalEvent: strippedEvent,
                    externalContext: context,
                    externalCallback:
                        function (err, value) {
                            if (conf.runFromSF) { // Add label to the callback to the stepfunction, which in turn becomes the input to the next lambda.
                                if (value) {
                                    value.ifcLabel = label;
                                    value.callbackSecurityBound = callbackSecurityBound;
                                }
                                if (conf.declassifiers &&
                                    conf.declassifiers.callback &&
                                    labelOrdering.lte(label, conf.declassifiers.callback.maxLabel) &&
                                    labelOrdering.lte(conf.declassifiers.callback.minLabel, callbackSecurityBound)) {

                                    return callback(eval(conf.declassifiers.callback.errCode)(err), eval(conf.declassifiers.callback.valueCode)(value));
                                } else {
                                    return callback(err, value);
                                }
                            } else {
                                if (conf.declassifiers &&
                                    conf.declassifiers.callback &&
                                    labelOrdering.lte(label, conf.declassifiers.callback.maxLabel) &&
                                    labelOrdering.lte(conf.declassifiers.callback.minLabel, callbackSecurityBound)) {

                                    return callback(eval(conf.declassifiers.callback.errCode)(err),eval(conf.declassifiers.callback.valueCode)(value));

                                } else {
                                    if (labelOrdering.lte(label, callbackSecurityBound)) {
                                        return callback(err, value);
                                    } else {
                                        return callback(null);
                                    }
                                }
                            }
                        },
                    bumpLabelTo:
                        function (newLabel) {
                            if (labelOrdering.lte(label, newLabel)) {
                                labelHistory.push(label)
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
                                    entries: () => skv.entries(label),
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
                                const rek = new aws.Rekognition();
                                return rek;

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

            if (notEmptyDir('/tmp/')) {
                console.log("WARNING : /tmp/ dir not empty on fresh invocation of lambda. Might lead to data leak.")
            }

            p.then((l) => {
                if (l === undefined) {
                    // In case getting the label failed, run on behalf of 'bottom' (completely unprivileged).
                    label = labelOrdering.getBottom();
                } else {
                    label = l;
                }

                if (conf.callbackSecurityBound) { // Statically defined security bound
                    callbackSecurityBound = conf.callbackSecurityBound;
                } else if (conf.runFromKinesis) { // Not entirely sure what callback security bounds mean in the context
                                                  // of kinesis and step functions.
                    if (!callbackSecurityBound) {
                        console.log("Kinesis event with no security bound.");
                        return callback("Kinesis event with no security bound.");
                    }
                } else if (conf.runFromSF) {
                    if (!callbackSecurityBound) {
                        console.log("StepFunctions event with no security bound.");
                        return callback("StepFunctions event with no security bound.");
                    }
                } else { // Running an http request - the security bound is the same as the invoking user's label.
                    callbackSecurityBound = label;
                }

                const vm = new NodeVM(executionEnv);

//                 console.log(`
// //  ***********************************
// //  ** Original Lambda Code:
// ${unsecuredLambda}
// //  ** End of Original Lambda Code:
// //  ***********************************
//
// module.exports.${handlerName}(externalEvent, externalContext, externalCallback);
//
//         `);

                vm.run(originalLambdaScript, conf.secLambdaFullPath);
            })
                .catch(err => {console.log(err)});
        };
    }
};


