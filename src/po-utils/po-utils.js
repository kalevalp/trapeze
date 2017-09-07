

function getTransitiveClosure(po) {
    let stack = [];
    const potc = {};

    const allElems = new Set();
    for (const x in po) {
        if (po.hasOwnProperty(x)) {
            allElems.add(parseInt(x));
            for (const y of po[x]) {
                allElems.add(y);
            }
        }
    }
    for (const e of allElems) {
        potc[e] = new Set();
        potc[e].add(e);
    }

    Object.keys(po).forEach((k) => {
        stack = stack.concat(parseInt(k));

        while (stack.length > 0) {
            const elem = stack.pop();

            let gteElem = po[elem];

            if (gteElem) { // NULL check
                stack = stack.concat(gteElem);
            }

            potc[k].add(elem);
        }
    });

    return potc;
}

function getAllLE (potc, label) {
    const res = new Set();

    for (const l in potc) {
        if (potc.hasOwnProperty(l)) {
            if (potc[l].has(label)) {
                res.add(parseInt(l));
            }
        }
    }

    return res;
}



export {getTransitiveClosure, getAllLE}