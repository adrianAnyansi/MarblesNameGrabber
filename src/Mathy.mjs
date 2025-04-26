/**
 * Calculate the average of this array
 * @param {Array<NumberLike>} array array of any math element
 */
export function average(array) {
    if (array.length == 0) return NaN;
    let mean = 0;
    for (const val of array)
        mean += val;
    return mean / array.length;
}

/**
 * Calculate the standard deviation of this array
 * @param {Array<NumberLike>} array array of any math element
 * @param {number} [mean=null] pass mean if percalucated
 * @returns {number}
 */
export function stdDev(array, mean = null) {
    if (array.length == 0) return NaN;
    mean = mean ?? average(array);
    let dev_calc = 0;
    for (const val of array) {
        dev_calc += (val - mean) ** 2;
    }
    return dev_calc / array.length;
}

export function toPct(decimal) {
    return (decimal * 100).toFixed(2)+'%'
}

/**
 * Rotates a 3D point using a rotation Matrix
 * @param {*} rotMatrix 
 * @param {*} pointMatrix 
 */ 
export function rotPoint (rotMatrix, pointMatrix) {

    const resPoint = [0, 0, 0]
    for (let i in rotMatrix[0]) {
        for (let j in pointMatrix) {
            resPoint[i] += rotMatrix[i][j] * pointMatrix[j]
        }
    }

    return resPoint
}

/**
 * Test if number is within range of sourceNum+-range
 * @param {number} testNum Number to test
 * @param {number} sourceNum Number to use as base
 * @param {number[]} range Either single number, or [lowNum, highNum]
 * @param {boolean} bothSides instead of assuming [0,range], assume [-range, range]
 */

export function inRange(testNum, sourceNum, range) {

    if (range == 0) {
        return testNum == range
    }

    const testRange = []
    if (Array.isArray(range) && range.length == 2) {
        testRange.push(...range)
    } else {
        testRange.push(0, range)
    }

    if (testRange[0] > testRange[1]) {
        testRange.push(testRange.shift()) // swap 
    }
    testRange.forEach((val, idx) => testRange[idx] += sourceNum)

    return testNum > testRange[0] && testNum < testRange[1]
}

/**
 * @type {(end:number) => number} return random integer [0,end)
 * @type {(start:number, end:number) => number} return random integer [start, end]
 */
export function randInt(end, start=0) {
    if (!start) {
        start = 0
    } else {
        [end, start] = [start, end]
    }
    return Math.trunc(Math.random()*(end-start)+start)
}
