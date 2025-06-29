// Jest unittest file

import {test} from 'node:test'
import assert from 'node:assert/strict'

import { ColorSpace } from "../UserNameBinarization.mjs";
import { delay, iterateN, iterateRN, Statistic, Stopwatch } from "../UtilityModule.mjs";
import { randInt, rotPoint } from '../Mathy.mjs';
import { Heap, LimitedList } from '../DataStructureModule.mjs';
import { UsernameAllTracker } from '../UsernameTrackerClass.mjs';

test("Confirms mathy iterator works", 
    () => {
        assert.deepStrictEqual(Array.from(iterateN(10)), [0,1,2,3,4,5,6,7,8,9]);
        assert.deepStrictEqual(Array.from(iterateN(8,2)), [2,3,4,5,6,7]);
        assert.deepStrictEqual(Array.from(iterateN(2,8)), [8,7,6,5,4,3]);
        assert.deepStrictEqual(Array.from(iterateN(-2,8)), [8,7,6,5,4,3,2,1,0,-1]);
        assert.deepStrictEqual(Array.from(iterateN(-10,2)), [2,1,0,-1,-2,-3,-4,-5,-6,-7,-8,-9]);

        assert.deepStrictEqual(Array.from(iterateRN(5,2)),
            [4,3,2])
    }
)

test("Confirm colorspace rotation",
    () => {
        const point = [115,145,245];
        assert.equal(ColorSpace.COLORS.SUB_BLUE.check(point), true)

        const point2 = [100,0,0];
        const matrix = [
            [0,0,1],
            [0,1,0],
            [-1,0,0]
        ]
        const rotdPoint = rotPoint(matrix, point2)
        const expPoint = [0, 0, 100] // rotate into the Z axis
        assert.deepEqual(rotdPoint, expPoint)
    }
)

// TODO: Add Color unit-testing

test ("Working?",
    () => {
        assert.equal(1, 1);
    }
)

test ("Math randInt",
    () => {
        const testVal = randInt(5)
        assert.equal( testVal < 5, true)
        assert.equal( testVal >= 0, true)

        const testRange = randInt(2,4)
        // fuzzy check this 
        assert.equal( testRange < 4, true)
        assert.equal( testRange >= 2, true)
    }
)

test ("Heap test", () => {

    const list = [45,36,5,89,32,49,49,86,4,7,2]

    const minHeap = new Heap(list)
    const minList = list.slice().sort((a,b) => a - b)
    for(const l_val of minList.values())
        assert.equal(minHeap.pop(), l_val)

    const maxHeap = new Heap(list, null, false)
    const maxList = list.slice().sort((a,b) => b - a)
    for(const l_val of maxList.values())
        assert.equal(maxHeap.pop(), l_val)
})

async function longCalc () {
    const limit = Math.random() * 10_000_000 + 100_000_000;
    let num = 0;
    console.log(`Counting to ${limit}`)
    for (const i of iterateN(limit)) {
        num += i
    }
    console.log(`Finished count to ${limit}`)
    return limit
}

test ("Async sync", async () => {
    // omg worker threads are like JS threads and need a new file... :(
    let prom1s = [longCalc(), longCalc(), longCalc()]
    await Promise.all(prom1s)
})

test ("Statistic class", async () => {
    const stat = new Statistic()

    const test = [1,2,3,4,5,6,7,8,9] // sum to 20
    for (const num of test)
        stat.add(num)
    
    assert.equal(stat.count, test.length)
    assert.equal(stat.amount, test.reduce( (a,b) => a+b))
    assert.equal(stat.mean, test.reduce( (a,b) => a+b) / test.length)

})

test ("Statistics std dev", async () => {
    const test = [1,2,3,4,5,6,7,8,9]
    const stat = new Statistic(true, test)

    // std deviation calc
    assert.equal(stat.stdDev.toFixed(7), 2.7386128.toFixed(7))
})

test ("Test Stopwatch class", async () => {
    const sw = new Stopwatch()
    sw.stop()

    const time = sw.read()
    assert.equal(Math.round(time), 0)
    const [timeWait, timeFrom] = [1_000, 200]

    sw.continue()
    delay(timeWait);
    sw.stop()
    // await new Promise (res => setTimeout (res, timeWait))

    assert.equal(Math.round(sw.read()), Math.round(performance.now()-sw.start_ts))
    assert.equal(Math.round(sw.read(timeFrom)), Math.round(performance.now() - (sw.start_ts - timeFrom)))

    const fromNow = sw.read()
    const randWaitTime = Math.random() * 1000 + 100

    sw.continue()
    await new Promise (res => setTimeout ( res, randWaitTime))
    sw.stop()

    assert.equal(Math.round(sw.read(fromNow) * 0.1) , Math.round(randWaitTime * 0.1) )
    assert.equal(Math.round(sw.read()), Math.round(performance.now()-sw.start_ts))
    assert.equal(Math.round(sw.read(fromNow)), Math.round(performance.now()-(sw.start_ts - fromNow)))
    // console.log("waitTime", randWaitTime, "fromNow", fromNow, "start_time", sw.start_ts, "perf", performance.now())

})

test ("Limited List testing", async () => {

    // Test max length & initial list
    const ll = new LimitedList(5)
    assert.equal(ll.maxLength, 5)
    assert.equal(ll.list.length, 0)
    
    // Test intial list ASC order
    const ll2 = new LimitedList(5,[4,1,2,3])
    assert.equal(ll2.list.length, 4)
    assert.equal(ll2.peek(), 1)
    assert.equal(ll2.sneak(), 4)
    ll2.push(2.5)
    assert.equal(ll2.list[2], 2.5)
    assert.equal(ll2.sneak(), 4)

    ll2.push(11) // this will not get added as max length has been reached
    assert.equal(ll2.sneak(), 4)

    ll2.push(0) // this will get added and push 4 out
    assert.equal(ll2.sneak(), 3)

    // Test initial list but DSC order
    const ll3 = new LimitedList(5, [1,2,3], LimitedList.defaultDSCSort)
    assert.equal(ll3.peek(), 3)
    assert.equal(ll3.sneak(), 1)
    ll3.push(0.5)
    assert.equal(ll3.sneak(), 0.5)
    assert.equal(ll3.peek(), 3)
})