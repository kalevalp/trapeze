function main(params) {
    "use strict";

    return Promise.resolve()
        .then(() => ({ message: `Yo ${params.name}!!`}));
}

exports.main = main;
