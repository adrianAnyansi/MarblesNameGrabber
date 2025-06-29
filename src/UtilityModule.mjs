
/**
 * Performance timing helper function cause JS one has baggage
 * TODO: Allow for banked time (pausing while retaining times)
 */
export class Stopwatch {

    constructor(name=null) {
        this.name = name
        this._start()
    }

    /**
     * Return human readable timestamp
     * @returns {string}
     */
    get htime () {
        return Stopwatch.msToHUnits(this.read(), false)
    }

    /**
     * Return time difference in ms. If not stopped, return from performance.now
     * @param {number} from_time measure from this time as start time
     * @returns {number} milliseconds since start
     */
    read(from_time=null) {
        const end_time = this.stop_ts ?? performance.now()
        return end_time - (this.start_ts - (from_time ?? 0))
    }

    /**
     * Start stopwatch. This will overwrite any previous values
     */
    _start () {
        this.start_ts = performance.now()
        this.stop_ts = null
    }

    /**
     * Starts stopwatch by resetting the start time
     */
    restart () {
        this._start()
    }

    /**
     * Stop stopwatch at this time
     */
    stop () {
        this.stop_ts = performance.now()
        return this.read()
    }

    /**
     * Continue the stopwatch without changing the start time
     */
    continue () {
        this.stop_ts = null
    }

    static TIME_SEQUENCE = new Map(Object.entries({
        "ms": 1_000,
        "s": 60,
        "m": 60,
        "h": 60,
        "d": 24,
        "w": 7
    }))

    /**
     * Parse milliseconds to human-readable format
     */
    static msToHUnits(ms, multiUnit=true, decimalPlaces=2, useUnit=null) {
        let currVal = ms
        let composedStr = ``
        
        let currUnit = Stopwatch.TIME_SEQUENCE['ms']

        for ( const [unit_text,unit_div] of Stopwatch.TIME_SEQUENCE) {
            currUnit = unit_text
            if (currVal < unit_div) break;
            if (unit_text == useUnit) break;

            const unit_val = Math.trunc(currVal%unit_div)
            currVal /= unit_div;
            composedStr += unit_val == 0 ? '' : ` ${unit_val}${unit_text}`
        }

        return multiUnit ? 
            `${Math.trunc(currVal)}${currUnit}`+composedStr :
            currVal.toFixed(decimalPlaces)+currUnit
    }
}


// TODO: Write a different function for binary-search version of this

/**
 * Return where this value is step
 * @template {any} C any comparable value
 * @template {any} M mapped value from stepped function
 * @param {C} value 
 * @param {Map<C, M>} steps
 * @returns {M} mapped value
 */
export function steppedFunction (value, steps) {
    let lastStepName = null
    for (const [currStep, stepName] of steps) {
        lastStepName = stepName
        if (value <= currStep) {
            return stepName
        }
    }
    return lastStepName
}

/**
 * Keep track and generate statistics 
 */
export class Statistic {

    /**
     * @param {boolean} [storeNums=false] keep numbers for median/mode calcs
     */
    constructor (storeNums=false, numArr=[]) {
        this.storeNums = storeNums;
        this.numArr = this.storeNums ? [] : null;

        this.count = 0;
        this.amount = 0;
        if (numArr) {
            for (const val of numArr) this.add(val)
        }
    }

    add(num) {
        if (this.storeNums)
            this.numArr.push(num)
        this.amount += num;
        this.count += 1;
    }

    get mean() {
        if (this.count == 0) return NaN
        return this.amount / this.count;
    }

    /**
     * @param {Array<Number>} array 
     */
    static CalcMean (array) {
        if (array.length == 0) return NaN;
        let mean = 0;
        for (const val of array)
            mean += val;
        return mean / array.length;
    }

    /**
     * Calculate the standard deviation of object
     * @returns {number}
     */
    get stdDev() {
        if (!this.numArr || this.numArr.length == 0) return null
        // this.mean;
        let dev_calc = 0;
        for (const val of this.numArr) {
            dev_calc += (val - this.mean) ** 2;
        }
        return Math.sqrt(dev_calc / (this.numArr.length-1));
    }

    // TODO: Medians and etc
}

/** Helper function to get an iterator of N length
 * Basically Javascript equivalent of Python iterators
 * @param {number} endAt int to stop at (not inclusive)
 * @param {number} start integer to start at
 */
export function iterateN(endAt, start = 0, step=1) {
    const iterDir = endAt > start ? 1 * step : -1 * step;
    return {
        [Symbol.iterator]() {
            let count = start - iterDir;
            const end = endAt;

            return {
                next() {
                    count += iterDir;
                    if ((iterDir > 0 && count >= end) || (iterDir < 0 && count <= end))
                        return { done: true, value: count };
                    else return { done: false, value: count };
                }
            };
        }
    };
}

/**
 * Helper for reverse iteration
 * Returns [start,0) by default.
 * Mostly useful for 
 */
export function iterateRN(startAt, end=0) {
    const iterDir = end > startAt ? 1 : -1;
    return iterateN(end+iterDir, startAt+iterDir)
}

/**
 * Creating a nice way to format map objects
 * @param {Map<>} map 
 * @param {string} [key_value_sep=','] Separator for key value
 * @param {string} [entry_sep='|'] Separator for entries
 * @param {(a: any, b: any) => void} [sort_func=(a,b) => {a-b}] sort function for keys default is subtraction
 */
export function formatMap(map, key_value_sep=',', entry_sep='|', sort_func=(a,b) => {a-b}) {
    /** @type {string[]} return string of 'key<separator>value' */
    const keyValueStrs = Array.from(map.entries().map( ([k,v]) => `${k}${key_value_sep}${v}`))
    if (sort_func)
        keyValueStrs.sort(sort_func)
    return keyValueStrs.join(entry_sep)
}

export function trimObject(object) {
    for (const objName in object) {
        if (object[objName] == 0)
            delete object[objName]
    }
}

export async function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}