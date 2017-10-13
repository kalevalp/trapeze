class PartialOrder {

    // Note: Currently, partial order only supports string elements.
    // TODO: Handle numeric elements.
    constructor(po) {
        this.potc = PartialOrder.getTransitiveClosure(po)
    }


    /**
     * Returns the top element of the lattice.
     * Note: This methods assumes the partial order is a lattice. If multiple local maxima exist, it will return one of them.
     *
     * @returns {string} - the top element of the lattice.
     * @throws An exception if top does not exist (i.e. the partial order is not a lattice)
     */
    getTop() {
        if (this.top !== undefined)
            return this.top;
        else {
            for (const label in this.potc) {
                if (this.potc.hasOwnProperty(label)) {
                    if (this.potc[label].size === 1) {
                        this.top = label;
                        return this.top;
                    }
                }
            }
        }
        throw "Error: No top element in lattice";
    }

    /**
     * Returns the bottom element of the lattice.
     * Note: This methods assumes the partial order is a lattice. If multiple local minima exist, it will return one of them.
     *
     * @returns {string} - the bottom element of the lattice.
     * @throws An exception if bottom does not exist (i.e. the partial order is not a lattice)
     */
    getBottom() {
        if (this.bottom !== undefined)
            return this.bottom;
        else {
            const s = new Set();
            for (const label in this.potc) {
                if (this.potc.hasOwnProperty(label)) {
                    s.add(...this.potc[label]);
                }
            }
            for (const label in this.potc) {
                if (this.potc.hasOwnProperty(label)) {
                    if (!s.has(label)) {
                        this.bottom = label;
                        return this.bottom;
                    }
                }
            }
        }
        throw "Error: No bottom element in lattice";
    }

    lte(val1,val2) {
        return this.potc[val1].has(val2);
    }

    static getTransitiveClosure(po) {
        let stack = [];
        const potc = {};

        const allElems = new Set();
        for (const x in po) {
            if (po.hasOwnProperty(x)) {
                allElems.add(x);
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
            stack = stack.concat(k);

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

    /**
     * Computes the set of all labels that are lesser then or equal to a given label according to the partial order.
     * @param label - A single label element.
     * @returns {Set} - All labels <= label.
     */
    getAllLE(label) {
        const res = new Set();

        for (const l in this.potc) {
            if (this.potc.hasOwnProperty(l)) {
                if (this.potc[l].has(label)) {
                    res.add(l);
                }
            }
        }
        return res;
    }

    getAllGE(label) {
        return this.potc[label];
    }
}

module.exports.PartialOrder = PartialOrder;



/* ************************
 *          Tests
 * ************************ */
if (process.argv[2] === "test") {
    let x = {'1': ['2', '3'], '2': ['3'], '3': ['5', '6'], '4': []};
    let po = new PartialOrder(x);
    console.log("************************");
    console.log("Transitive closure test 1:");
    console.log(x);
    console.log(po.potc);
    console.log("************************");

    x =  {
        "bottom" : ["userA", "userB"],
        "userA" : ["admin"],
        "userB" : ["admin"],
        "admin" : ["top"]
    };
    po = new PartialOrder(x);
    console.log("************************");
    console.log("Transitive closure test 2:");
    console.log(x);
    console.log(po.potc);
    console.log("************************");

    console.log("************************");
    console.log("Get all GE test: ");
    console.log(">= userA:")
    console.log(po.getAllGE("userA"));
    console.log("************************");


}