"use strict";

// const fs = require('fs')


// console.log("aaaa");


// const {VM} = require('vm2');
// const vm = new VM(options);
// const vm = new VM();

// vm.run(`console.log("bbbb")`);
// vm.run(`require('vm2')`);
// var l = vm.run(`fs.readdirSync(".")`)
// var l = fs.readdirSync(".")
// l.forEach(file => {
//   console.log(file);
// })

const aws = {
    conf: {
        a: 10,
        b: 20
    },
}

const {NodeVM} = require('vm2');

// const vm = new NodeVM({
//     console: 'inherit',
//     sandbox: {},
//     require: {
//         external: false,
//         builtin: ['fs', 'path'],
//         root: "./",
//         // mock: {
//         //     fs: {
//         //         readFileSync() { return 'Nice try!'; }
//         //     }
//         // }
//     }
// });

// // Sync

// let functionInSandbox = vm.run("module.exports = function(who) { console.log('hello '+ who); }");
// functionInSandbox('world');

// // Async

// let functionWithCallbackInSandbox = vm.run("module.exports = function(who, callback) { callback('hello '+ who); }");
// functionWithCallbackInSandbox('world', (greeting) => {
//     console.log(greeting);
// });

// vm.run('require("fs").readdirSync(".").forEach(file => {console.log(file); })')


// const vmNoConsole = new NodeVM({
//     console: 'off',
//     sandbox: {},
//     require: {
//         external: false,
//         builtin: ['fs', 'path'],
//         root: "./",
//         // mock: {
//         //     fs: {
//         //         readFileSync() { return 'Nice try!'; }
//         //     }
//         // }
//     }
// });

// // vmNoConsole.run('require("fs").readdirSync(".").forEach(file => {console.log(file); })')

// var l = vmNoConsole.run('var fs = require("fs"); fs.readdirSync(".")');
// // console.log(l);
// // l.forEach(file => {console.log(file); });

// vm.run(`console.log("Heyyyy");`)
// vm.run(`eval('console.log("Hi??");')`)

// var a = vm.run(`module.exports = "bb"`);
// console.log(a);

// var x = {};
// x.foo = function() {
//     console.log("Hello World!!");
// };
// x.foo();

// const vmNoConsole = new NodeVM({
//     console: 'off',
//     sandbox: {},
//     require: {
//         external: false,
//         builtin: ['fs', 'path'],
//         root: "./",
//         // mock: {
//         //     fs: {
//         //         readFileSync() { return 'Nice try!'; }
//         //     }
//         // }
//     }
// });
//
// vmNoConsole.run(`
//     x.foo()
//     x.foo = function () {
//         console.log("Not so fast??");
//     };
//     x.foo();
//     `);

// x.foo();
//
// var o = vmNoConsole.run(`
//     var x = {};
//     x.foo = function() {
//         return "Hello world from function defined in sandbox!!";
//     };
//     x.foo();
//
//     module.exports.x = x;
//
//     // console.log (module)
//     `);
//
// console.log(o.x.foo());

// var a = vmNoConsole.run(`
//     module.exports.foo = function () {
//         var c = "console.log(\'If this prints we're all fucked\')";
//         // return c;
//         eval(c);
//     }
//     `)
// a.foo()

const vmNoConsole = new NodeVM({
    console: 'inherit',
    sandbox: {},
    // wrapper: 'none',
    require: {
        external: false,
        builtin: [],
        // root: "./",
        context: 'sandbox',
        mock: {
            // 'a' : {
            //     A: class {
            //         constructor() {this.b = 10}
            //     }
            // },
            // mysql: {
            //     connect() { console.log("Nope!"); }
            // },
            'aws' : {
                conf: aws.conf,
                // conf: new Proxy(aws.conf, {
                //     set(target, property, value, receiver) {
                //         console.log(target);
                //         console.log(property);
                //         console.log(value);
                //         console.log(receiver);
                //     }
                // }),

                addc: () => {aws.conf.c = 100},
            }
        }
    }
});

// vmNoConsole.run(`
//     const m = require('mysql');
//     m.connect();
//     // const fs = require('fs');
//     const {A} = require('a');
//     const a = new A();
//     console.log(a.b);
// `);
// vmNoConsole.run(`
//     const p = Promise.resolve(10101010);
//     p.then(ten => console.log(ten));
// `);

vmNoConsole.run(`
    'use strict';
    
    const aws = require('aws');
    console.log(aws);
    // aws.c = 111;
    // console.log(aws.c);
    aws.conf.c = 100;
    console.log(aws);
    // aws.addc();
    // console.log(aws);
`);
