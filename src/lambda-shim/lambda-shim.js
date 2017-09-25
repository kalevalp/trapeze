"use strict";

const {NodeVM} = require("vm2");
const fs = require("fs");
const {PartialOrder} = require("po-utils");
const {TotalOrder} = require("to-utils");
const {auth} = require("auth");
const {SecureKV_PO} = require("secure-kv-po");
const {SecureKV_TO} = require("secure-kv-to");

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
let label;

const labelOrdering = conf.usingPO ? new PartialOrder(conf.labels) : new TotalOrder(conf.min, conf.max);

module.exports.makeShim = function (exp) {

    exp.handler = function (event, context, callback) {

        if (notEmptyDir('/tmp/')) {
            console.log("WARNING : /tmp/ dir not empty on fresh invocation of lambda. Might lead to data leak.")
        }

        // Run on behalf of invoking user.
        auth(event.user, event.pass, (err, label) => {
            if (err) {
                callback(err);
            } else {
                const skv = conf.usingPO ?
                    new SecureKV_PO(conf.host, conf.user, conf.pass, labelOrdering) :
                    new SecureKV_TO(conf.host, conf.user, conf.pass);

                if (label === undefined) {
                    // In case getting the label failed, run on behalf of 'bottom' (completely unprivileged).
                    label = labelOrdering.getBottom();
                }

                let declf;
                if (conf.declassifier) {
                    // The relative path part of the next require is a very dangerous workaround to model load issues.
                    // TODO: KALEV - Should change to something more robust.
                    declf = require("../../decl");
                }

                const vm = new NodeVM({
                    // console: 'off',
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
                        external: false,
                        builtin: ['fs'],
                        root: "./",
                        mock: {
                            'kv-store': {
                                KV_Store: class {
                                    constructor(h, u, pwd) {
                                    }

                                    init(callback) {
                                        skv.init(callback);
                                    }

                                    close(callback) {
                                        skv.close(callback);
                                    }

                                    put(k, v, callback) {
                                        skv.put(k, v, label, callback);
                                    }

                                    get(k, callback) {
                                        skv.get(k, label, callback);
                                    }
                                }
                            }
                        }
                    }
                });

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
            }
        });
    };
}


