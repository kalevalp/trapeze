// const bbPromise = require('bluebird');
//
// // bbPromise.resolve()
// //     .then(() => console.log("Test1"))
// //     .then(() => console.log("test11"))
// //     .then((val) => console.log("Huhh? " + val + " !!!"))
// //     .then(() => bbPromise.resolve(true))
// //     .then((val) => console.log("Huhh? " + val + " !!!"));
// //
// // bbPromise.resolve()
// //     .then(() => console.log("Test2"))
// //     .then(() => bbPromise.reject("ERROR!"))
// //     .then(() => console.log("Test222"))
// //     .catch((err) => console.log(err));
//
// const d1 = bbPromise.resolve("Test");
// console.log(d1);
//
// const func = bbPromise.coroutine(function*(){
//     const d2 = bbPromise.resolve("Test");
//     console.log(d2);
//
//     const d3 = yield bbPromise.resolve("Test");
//     console.log(d3);
// });
//
// func();

(function loop (i) {
    console.log("~~~~~~~~~~~~~~~~~~~~~~~");
    return new Promise(resolve => {
        console.log(i);
        resolve();
        // return i;
    }).then( () => i >= 10 || loop(i+1) )
})(0);

// (function loop(i) {
//     if (i <= 10) new Promise(resolve => {
//         console.log(i);
//         setTimeout(resolve, Math.random() * 1000);
//     }).then(loop.bind(null, i+1));
// })(0);
