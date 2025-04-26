// Jest unittest file

import {test} from 'node:test'
import assert from 'node:assert/strict'

import { ColorSpace } from "../UsernameBinarization.mjs";
import { iterateN, iterateRN } from "../UtilityModule.mjs";
import { randInt } from '../Mathy.mjs';
import { Heap } from '../DataStructureModule.mjs';

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
    const maxList = list.slice().sort()
    for(const l_val of maxList.values())
        assert.equal(maxHeap.pop(), l_val)
})