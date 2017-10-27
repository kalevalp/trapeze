"use strict";

const {NodeVM} = require("vm2");
const fs = require("fs");
const {PartialOrder} = require("po-utils");
const {TotalOrder} = require("to-utils");
const {auth} = require("auth");
const {SecureKV_PO} = require("secure-kv-po");
const {SecureKV_TO} = require("secure-kv-to");
const aws = require("aws");

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
    exp.handler = function (event, context, callback) {

        let label;
        let executionEnv = {
            console: 'inherit',
            sandbox: {
                externalEvent: event,
                externalContext: context,
                externalCallback:
                    function (err, value) {
                        if (conf.declassifier &&
                            labelOrdering.lte(label, conf.declassifier.maxLabel) &&
                            labelOrdering.lte(conf.declassifier.minLabel, conf.securityBound)) {
                            declf.declassifier(err, value, callback);
                        } else {
                            if (labelOrdering.lte(label, conf.securityBound)) {
                                callback(err, value);
                            } else {
                                callback(null);
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
                        KV_Store: function(h, u, pwd, tableName) {
                            const skv = conf.usingPO ?
                                new SecureKV_PO(conf.host, conf.user, conf.pass, labelOrdering, tableName) :
                                new SecureKV_TO(conf.host, conf.user, conf.pass, tableName);

                            return {
                                init:    ()     => skv.init(),
                                close:   ()     => skv.close(),
                                put:     (k, v) => skv.put(k, v, label),
                                get:     (k)    => skv.get(k, label),
                                del:     (k)    => skv.del(k, label),
                                keys:    ()     => skv.keys(label),
                                entries: ()     => skv.entries(label),
                            }
                        }
                    },
                    'aws': {
                        Kinesis: function () {
                            const kinesis = aws.Kinesis();
                            return {
                                putRecord: (event, callback) => {
                                    if (event.Data.ifcLabel) { // && event.Data.ifcLabel !== label) {
                                        throw `Unexpected security label. Event written to kinesis should not have an ifcLabel field. Has label: ${event.ifcLabel}`;
                                    } else {
                                        event.Data.ifcLabel = label;
                                        return kinesis.putRecord(event, callback);
                                    }
                                },
                            }
                        }
                    }
                }
            }
        };

        if (notEmptyDir('/tmp/')) {
            console.log("WARNING : /tmp/ dir not empty on fresh invocation of lambda. Might lead to data leak.")
        }

        let p;

        if (conf.runFromKinesis && event.Data.ifcLabel) { // Handle events originating from AWS Kinesis.
            p = Promise.resolve(event.Data.ifcLabel);
        } else if (conf.runFromSF && event.ifcLabel) { // Handle events originating from AWS Step Functions.
            p = Promise.resolve(event.ifcLabel);
        } else { // Run on behalf of invoking user.
            p = auth(event.user, event.pass);
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

module.exports.${conf.handler}(externalEvent, externalContext, externalCallback);

        `);

            vm.run(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports.${conf.handler}(externalEvent, externalContext, externalCallback);
        `);
        })
            .catch(err => callback(err));
    };
};


