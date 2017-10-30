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

            let p;
            const strippedEvent = event;
            if (conf.runFromKinesis) { // Handle events originating from AWS Kinesis.

                let ifcLabel;
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
                    record.kinesis.data = new Buffer(JSON.stringify(parsed)).toString('base64');
                    return record;
                });

                if (!ifcLabel) {
                    console.log("Could not resolve an ifcLabel in kinesis event.")
                    return callback("Could not resolve an ifcLabel in kinesis event.")
                }

                console.log(`Running kinesis event with label: ${ifcLabel}`);

                p = Promise.resolve(ifcLabel);
            } else if (conf.runFromSF /* && event.ifcLabel*/) { // Handle events originating from AWS Step Functions.
                const sfLabel = event.ifcLabel;
                delete strippedEvent.label;
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
                                }
                                return callback(err, value);
                            } else {
                                if (conf.declassifier &&
                                    labelOrdering.lte(label, conf.declassifier.maxLabel) &&
                                    labelOrdering.lte(conf.declassifier.minLabel, conf.securityBound)) {
                                    declf.declassifier(err, value, callback);
                                } else {
                                    if (labelOrdering.lte(label, conf.securityBound)) {
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
                    external: allowExtReq,
                    builtin: ['fs'],
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
                                            .then(res => res[0].rowvalues); // Arbitrary choice (?)
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
                                        } else {
                                            data.ifcLabel = label;
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
                                        transParams.input = JSON.stringify(input);
                                        return stepfunctions.startExecution(transParams, callback);
                                    },
                                    getActivityTask: (params, callback) => stepfunctions.getActivityTask(params, callback),
                                    sendTaskFailure: (params, callback) => stepfunctions.sendTaskFailure(params, callback),
                                    sendTaskSuccess: (params, callback) => stepfunctions.sendTaskSuccess(params, callback),
                                }
                            }
                        },
                        'nodemailer' : {
                            createTestAccount: () => {
                                if (labelOrdering.lte(label, conf.securityBound)) {
                                    return nodemailer.createTestAccount();
                                } else {
                                    throw "Attempting to create test account in violation with security policy"
                                }
                            },
                            createTransport: (params) => {
                                const mailer = nodemailer.createTransport(params);

                                return {
                                    sendMail: (mailOptions) => {
                                        if (labelOrdering.lte(label, conf.securityBound)) {
                                            return mailer.sendMail(mailOptions);
                                        } else {
                                            throw "Attempting to send in violation with security policy"
                                        }

                                    }
                                }
                            },
                            getTestMessageUrl: (info) => nodemailer.getTestMessageUrl(info),
                        }
                    }
                }
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
                .catch(err => console.log(err));
        };
    }
};


