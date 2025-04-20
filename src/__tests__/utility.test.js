// Jest unittest file

import {test} from 'node:test'
import assert from 'node:assert/strict'

import { ColorSpace } from "../UsernameBinarization.mjs";
import { iterateN } from "../UtilityModule.mjs";

test("Confirms mathy iterator works", 
    () => {
        assert.deepStrictEqual(Array.from(iterateN(10)), [0,1,2,3,4,5,6,7,8,9]);
        assert.deepStrictEqual(Array.from(iterateN(8,2)), [2,3,4,5,6,7]);
        assert.deepStrictEqual(Array.from(iterateN(2,8)), [8,7,6,5,4,3]);
        assert.deepStrictEqual(Array.from(iterateN(-2,8)), [8,7,6,5,4,3,2,1,0,-1]);
        assert.deepStrictEqual(Array.from(iterateN(-10,2)), [2,1,0,-1,-2,-3,-4,-5,-6,-7,-8,-9]);
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