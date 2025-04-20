// Jest unittest file

import { ColorSpace } from "../UsernameBinarization.mjs";
import { Mathy } from "../ImageModule.mjs"
import {expect, jest, test} from '@jest/globals';

test("Confirms mathy iterator works", 
    () => {
        expect(Array.from(Mathy.iterateN(10))).toStrictEqual([0,1,2,3,4,5,6,7,8,9]);
        expect(Array.from(Mathy.iterateN(8,2))).toStrictEqual([2,3,4,5,6,7]);
        expect(Array.from(Mathy.iterateN(2,8))).toStrictEqual([8,7,6,5,4,3]);
        expect(Array.from(Mathy.iterateN(-2,8))).toStrictEqual([8,7,6,5,4,3,2,1,0,-1]);
        expect(Array.from(Mathy.iterateN(-10,2))).toStrictEqual([2,1,0,-1,-2,-3,-4,-5,-6,-7,-8,-9]);
    }
)

test("Confirm colorspace rotation",
    () => {
        const point = [115,145,245]
        expect(ColorSpace.COLORS.SUB_BLUE.check(point)).toBe(true)
    }
)

// TODO: Add Color unit-testing

test ("Working?",
    () => {
        expect(1).toBe(1);
    }
)