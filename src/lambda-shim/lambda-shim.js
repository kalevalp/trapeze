"use strict";

const fs = require('fs');
const {NodeVM} = require('vm2');

// rmFilesInDir = function(dirPath) {
//     try { var files = fs.readdirSync(dirPath); }
//     catch(e) { return; }
//     if (files.length > 0)
//         for (var i = 0; i < files.length; i++) {
//             var filePath = dirPath + '/' + files[i];
//             if (fs.statSync(filePath).isFile())
//                 fs.unlinkSync(filePath);
//             else
//                 rmDir(filePath);
//         }
//     };

// rmFilesInDir('/tmp')

module.exports.handler = function (externalEvent, externalContext, externalCallback) {
    const vm = new NodeVM({
        // console: 'off',
        console: 'inherit',
        sandbox: { 
            externalEvent : externalEvent, 
            externalContext : externalContext, 
            externalCallback : externalCallback },
        require: {
            external: true,
            builtin: [],
            root: "./",
        }
    });

    vm.run(`
        // Original lambda code.
        //   Below is an example:
        module.exports.handler = (event, context, callback) => {
            console.log("Huh??");
            console.log(event);
            console.log(context);
            console.log(callback);
            // callback(null, 'Hello from Lambda');
            callback();
        };

        module.exports.callRes = module.exports.handler(externalEvent, externalContext, externalCallback);
        delete module.exports.handler;

        `);
}

// function(origLambda, handlerName, builtinLibraries, externalLibraries) {
//     res = vm.require(origLambda);
//     return res[handlerName];
// }
