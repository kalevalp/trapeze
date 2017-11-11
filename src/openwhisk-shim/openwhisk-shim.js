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
const child_process = require( 'child_process' );
const aws = require( 'aws-sdk' );
const https = require( 'https' );

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

        console.log(params);

        let label;
        let securityBound;

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
            // let reqBody;
            // if ((typeof params.body) === "string") {
            //     reqBody = JSON.parse(params.body);
            // } else {
            //     reqBody = params.body;
            // }
            // reqUser = reqBody.user;
            // reqPass = reqBody.pass;

            reqUser = params.user;
            reqPass = params.pass;
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
                    hrtime: process.hrtime,
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
                builtin: ['fs', 'url', 'path'],
                root: "./",
                mock: {
                    'kv-store': {
                        KV_Store: function (h, u, pwd, tableName) {
                            const skv = conf.usingPO ?
                                new SecureKV_PO(h, u, pwd, labelOrdering, tableName, true) :
                                new SecureKV_TO(h, u, pwd, tableName);

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
                    'child_process' : {

                        execSync: (command, options) => {
                            // Check that the command actually runs the correct file

                            if (command.split(' ')[0].split('/').slice(-1)[0] === 'gg-execute-static') {
                                return child_process.execSync(command,options);
                            } else {
                                throw "Trying to run an unexpected executable."
                            }

                        }
                    },
                    'aws-sdk' : {
                        configCredentials: (awsAccessKey, awsSecretKey) => {
                            aws.config.accessKeyId = awsAccessKey;
                            aws.config.secretAccessKey = awsSecretKey;
                        },
                        S3: function () {
                            const s3 = new aws.S3();

                            return {
                                upload : (data, callback) => {
                                    if (labelOrdering.lte(label, securityBound)) {
                                        return s3.upload(data, callback);
                                    } else {
                                        throw ("Attempting store a file in an S3 bucket, in violation of security policy");
                                    }

                                }
                            }
                        }
                    },
                    'https' : {
                        get : (url, callback)  => {
                            if (labelOrdering.lte(label, securityBound)) {
                                return https.get(url, callback);
                            } else {
                                throw ("Attempting to access a url in violation of security policy");
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
            if (conf.securityBound) {
                securityBound = conf.securityBound;
            } else {
                securityBound = l;
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
        `, '/nodejsAction/' + __dirname.split('/')[2] + "/" + conf.secLambda);
        })
            .then((executionResult) => {
                if (conf.declassifier &&
                    labelOrdering.lte(label, conf.declassifier.maxLabel) &&
                    labelOrdering.lte(conf.declassifier.minLabel, securityBound)) {
                    const declf = require("../../decl");
                    declf.declassifier(err, value, callback);
                } else {
                    if (labelOrdering.lte(label, securityBound)) {
                        return executionResult;
                    } else {
                        return Promise.reject("Attempting to return a dict/promise in violation with security policy");
                    }
                }
            })
            .catch(err => {
                console.log(err);
                return Promise.reject(err);
            })
    };
};