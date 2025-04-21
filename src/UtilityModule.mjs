
/**
 * Performance timing helper function cause JS one has baggage
 * TODO: Allow for banked time (pausing while retaining times)
 */
export class Stopwatch {

    constructor(name=null) {
        this.name = name
        this.start()
    }

    /**
     * Return human readable timestamp
     * @returns {string}
     */
    get time () {
        return Stopwatch.msToHUnits(this.read(), false)
    }

    /**
     * Return time difference in ms. If not stopped, return from performance.now
     * @returns {number} milliseconds since start
     */
    read() {
        const end_time = this.stop_ts ?? performance.now()
        return end_time - this.start_ts
    }

    /**
     * Start stopwatch. This will overwrite any previous values
     */
    start () {
        this.start_ts = performance.now()
        this.stop_ts = null
    }

    /**
     * Stop stopwatch at this time
     */
    stop () {
        this.stop_ts = performance.now()
        return this.read()
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

/** Helper function to get an iterator of N length
 * Basically Javascript equivalent of Python iterators
 * @param {number} endAt int to stop at (not inclusive)
 * @param {number} start integer to start at
 */
export function iterateN(endAt, start = 0) {
    const iterDir = endAt - start > 0 ? 1 : -1;
    return {
        [Symbol.iterator]() {
            let count = start - iterDir;
            const end = endAt;

            return {
                next() {
                    count += iterDir;
                    if ((iterDir == 1 && count >= end) || (iterDir == -1 && count <= end))
                        return { done: true, value: count };
                    else return { done: false, value: count };
                }
            };
        }
    };
}

