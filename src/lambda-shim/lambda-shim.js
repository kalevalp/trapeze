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


        exp[handlerName] = function (event, context, callback) {

            let label;
            let securityBound;

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
                        storedSecurityBound = parsed.securityBound;
                    } else if (storedSecurityBound !== parsed.securityBound) {
                        console.log("Batch of kinesis event with different security bounds unsupported.");
                        return callback("Batch of kinesis event with different security bounds unsupported.");
                    }
                    delete parsed.securityBound;

                    record.kinesis.data = new Buffer(JSON.stringify(parsed)).toString('base64');
                    return record;
                });

                if (!ifcLabel) {
                    console.log("Could not resolve an ifcLabel in kinesis event.")
                    return callback("Could not resolve an ifcLabel in kinesis event.")
                }
                if (!storedSecurityBound) {
                    console.log("Could not resolve a securityBound in kinesis event.")
                    return callback("Could not resolve a securityBound in kinesis event.")
                }

                console.log(`Running kinesis event with label: ${ifcLabel}`);

                securityBound = storedSecurityBound;
                console.log(`Running kinesis event with securityBound: ${securityBound}`);

                p = Promise.resolve(ifcLabel);
            } else if (conf.runFromSF /* && event.ifcLabel*/) { // Handle events originating from AWS Step Functions.
                const sfLabel = event.ifcLabel;
                delete strippedEvent.ifcLabel;

                securityBound = event.securityBound;
                delete strippedEvent.securityBound;

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
                                    value.securityBound = securityBound;
                                }
                                return callback(err, value);
                            } else {
                                if (conf.declassifier &&
                                    labelOrdering.lte(label, conf.declassifier.maxLabel) &&
                                    labelOrdering.lte(conf.declassifier.minLabel, securityBound)) {
                                    declf.declassifier(err, value, callback);
                                } else {
                                    if (labelOrdering.lte(label, securityBound)) {
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
                                label = newLabel;
                                return true;
                            } else {
                                return false;
                            }
                        },
                    bumpLabelToTop:
                        function () {
                            label = labelOrdering.getTop();
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
                                            throw `Unexpected security label. Event written to kinesis should not have an ifcLabel field. Has label: ${event.ifcLabel}`;
                                        } else if (data.securityBound) {
                                            throw `Unexpected security bound. Event written to kinesis should not have a securityBound field. Has label: ${event.securityBound}`;
                                        } else {
                                            data.ifcLabel = label;
                                            data.securityBound = securityBound;

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
                                        input.securityBound = securityBound;
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
                                //         if (labelOrdering.lte(label, securityBound)) {
                                //             return rek.detectLabels(params, callback);
                                //         } else {
                                //             return callback("Attempting to call detectLabels in violation with security policy");
                                //         }
                                //     }
                                // }
                            },
                        },
                        'nodemailer' : {
                            createTestAccount: () => {
                                if (labelOrdering.lte(label, securityBound)) {
                                    return nodemailer.createTestAccount();
                                } else {
                                    throw "Attempting to create test account in violation with security policy"
                                }
                            },
                            createTransport: (params) => {
                                const mailer = nodemailer.createTransport(params);

                                return {
                                    sendMail: (mailOptions) => {
                                        if (labelOrdering.lte(label, securityBound)) {
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
                                if (labelOrdering.lte(label, securityBound)) {
                                    return got.get(uri, params);
                                } else {
                                    return Promise.reject("Attempting to access a url in violation with security policy");
                                }
                            }
                        },
                        'node-fetch' : (params) => {
                            if (labelOrdering.lte(label, securityBound)) {
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

                if (conf.securityBound) { // Statically defined security bound
                    securityBound = conf.securityBound;
                } else if (conf.runFromKinesis) {
                    if (!securityBound) {
                        console.log("Kinesis event with no security bound.");
                        return callback("Kinesis event with no security bound.");
                    }
                } else if (conf.runFromSF) {
                    if (!securityBound) {
                        console.log("StepFunctions event with no security bound.");
                        return callback("StepFunctions event with no security bound.");
                    }
                } else { // Running an http request - the security bound is the same as the invoking user's label.
                    securityBound = label;
                }

                let declf;
                if (conf.declassifier) {
                    // The relative path part of the next require is a very dangerous workaround to model load issues.
                    // TODO: KALEV - Should change to something more robust.
                    declf = require("../../decl");
                }

                const vm = new NodeVM(executionEnv);

                console.log(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports.${handlerName}(externalEvent, externalContext, externalCallback);

        `);

                vm.run(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports.${handlerName}(externalEvent, externalContext, externalCallback);
        `, conf.secLambdaFullPath);
            })
                .catch(err => {console.log(err)});
        };
    }
};


