"use strict";

// Usage: (secure-<func>.js)
// const shim = require('openwhisk-shim');
// main = shim.makeShim(true);


const {NodeVM} = require("vm2");
const fs = require("fs");
const {PartialOrder} = require("po-utils");
const {TotalOrder} = require("to-utils");
const {auth} = require("auth");
const {SecureKV_PO} = require("secure-kv-po");
const {SecureKV_TO} = require("secure-kv-to");
const nodemailer = require("nodemailer");
const got = require('got');

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

const conf = JSON.parse(fs.readFileSync(__dirname.split('node_modules')[0] + 'conf.json', 'utf8'));
const unsecuredLambda = fs.readFileSync(__dirname.split('node_modules')[0] + conf.unsecLambda, 'utf8');

const labelOrdering = conf.usingPO ? new PartialOrder(conf.labels) : new TotalOrder(conf.min, conf.max);

module.exports.makeShim = function (allowExtReq) {
    return function (params) {

        let label;

        let reqUser;
        let reqPass;

        if (conf.runFromGET) { // Run http GET request on behalf of invoking user.
            reqUser = params.queryStringParameters.user;
            reqPass = params.queryStringParameters.pass;
            if (conf.userPassForIFCOnly) {
                delete params.queryStringParameters.user;
                delete params.queryStringParameters.pass;
            }
        } else { // Run http POST request on behalf of invoking user.
            let reqBody;
            if ((typeof params.body) === "string") {
                reqBody = JSON.parse(params.body);
            } else {
                reqBody = params.body;
            }
            reqUser = reqBody.user;
            reqPass = reqBody.pass;

        }

        const p = auth(reqUser, reqPass);

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
                externalParams: params,
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
                    'nodemailer': {
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
                    },
                    'got': {
                        get: (uri, params) => {
                            if (labelOrdering.lte(label, conf.securityBound)) {
                                return got.get(uri, params);
                            } else {
                                return Promise.reject("Attempting to access a url in violation with security policy");
                            }
                        }
                    }
                }
            }
        };

        // Need to understand exactly how the filesystem retains information between executions and
        // make sure that it is handled.
        // if (notEmptyDir('/tmp/')) {
        //     console.log("WARNING : /tmp/ dir not empty on fresh invocation of lambda. Might lead to data leak.")
        // }

        return p.then((l) => {
            if (l === undefined) {
                // In case getting the label failed, run on behalf of 'bottom' (completely unprivileged).
                label = labelOrdering.getBottom();
            } else {
                label = l;
            }

            const vm = new NodeVM(executionEnv);

            console.log(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports = module.exports.main(externalParams);

        `);

            return vm.run(`
//  ***********************************
//  ** Original Lambda Code:
${unsecuredLambda}
//  ** End of Original Lambda Code:
//  ***********************************

module.exports = module.exports.main(externalParams);
        `, conf.secLambdaFullPath);
        })
            .then((executionResult) => {
                if (conf.declassifier &&
                    labelOrdering.lte(label, conf.declassifier.maxLabel) &&
                    labelOrdering.lte(conf.declassifier.minLabel, conf.securityBound)) {
                    const declf = require("../../decl");
                    declf.declassifier(err, value, callback);
                } else {
                    if (labelOrdering.lte(label, conf.securityBound)) {
                        return executionResult;
                    } else {
                        return Promise.reject("Attempting to return a dict/promise in violation with security policy");
                    }
                }
            })
    };
};