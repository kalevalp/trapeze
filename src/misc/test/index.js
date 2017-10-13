const fs = require("fs");

exports.handler = (event, context, callback) => {
    console.log("## File: " + __filename);
    console.log("## Directory: " + __dirname);

    let items = fs.readdirSync(".");
    console.log(items);

    for (let i=0; i<items.length; i++) {
        console.log(items[i]);
    }
    callback(null, 'Hello from Lambda');

};