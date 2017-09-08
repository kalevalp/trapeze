class TotalOrder {
    lte;

    constructor(min, max, succ, lte) {
        this.min = min;
        this.max = max;
        this.succ = succ;
        if (lte !== undefined) {
            this.lte = lte;
        } else {
            this.lte = function (val1,val2) {
                return val1 <= val2;
            }
        }
    }

    getTop() {
        return this.getMax();
    }

    getMax() {
        return this.max;
    }

    getBottom() {
        return this.getMin();
    }

    getMin() {
        return this.min;
    }

    getAllLE(label) {
        let res = new Set();

        if (this.succ !== undefined) {
            let curr = this.min;
            while (this.lte(curr,label)) {
                res.add(curr);
                curr = this.succ(curr);
            }
        } else if (
            Number.isInteger(this.min) &&
            Number.isInteger(this.max) &&
            Number.isInteger(label))
        {
            for (let i = this.min; this.lte(i, label); i = i + 1) {
                res.add(i);
            }
        } else {
            throw "Error: trying to collect all less than or equal in a total ordering over non integers and without a successor function."
        }
        return res;
    }
}

export {TotalOrder};



/* ************************
 *          Tests
 * ************************ */
if (process.argv[2] === "test") {

}
