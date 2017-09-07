"use strict";

import {NodeVM} from "vm2";
import fs from "fs";
import {PartialOrder} from "po-utils"

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

let po;
if (conf.usingPO) {
    po = new PartialOrder(conf.labels);
}

module.exports.handler = function (event, context, callback) {

    const vm = new NodeVM({
        // console: 'off',
        console: 'inherit',
        sandbox: { 
            externalEvent : event,
            externalContext : context,
            externalCallback :
                function (err, value) {
                    if (po.lte(label, conf.securityBound)) {
                        callback(err,value);
                    } else {
                        callback(null);
                    }

                }
            },
        require: {
            external: true,
            builtin: [],
            root: "./",
        }
    });

     let callres = vm.run(`
/* ***********************************
/* ** Original Lambda Code:
${unsecuredLambda}
/* ** End of Original Lambda Code:
/* ***********************************

module.exports = module.exports.handler(externalEvent, externalContext, externalCallback);
        `);
};

// function(origLambda, handlerName, builtinLibraries, externalLibraries) {
//     res = vm.require(origLambda);
//     return res[handlerName];
// }
