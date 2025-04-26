// Jest unittest for binarization

import {it, test} from 'node:test'
import assert from 'node:assert/strict'

import { ColorSpace, UserNameBinarization, VisualUsername } from "../UsernameBinarization.mjs";
import sharp from 'sharp'
import { Color, Direction2D, SharpImg } from '../ImageModule.mjs';
import { Stopwatch, iterateN } from '../UtilityModule.mjs';
import { NativeTesseractOCRManager, TestTesseractOCRManager } from '../OCRModule.mjs';
import { TrackedUsername, UsernameAllTracker } from '../UsernameTrackerClass.mjs';

const testingFolder = String.raw`testing\\`;
const curatedFolder = String.raw`testing\curated\\`;
const chatTestingFolder = String.raw`testing\chat_testing\\`;
const vodTestingFolder = String.raw`testing\\vod_dump\\%s.jpg`
const ocrTestingFolder = String.raw`testing/ocr_test/`

const page = 303;
const vodTestFilename = getFilename(vodTestingFolder, page)

function getFilename(folder, page) {
    return folder.replace('%s', page)
}

test("Single pixel line test check", 
    async () => {
        const filename = String.raw`testing\line_test\streamlink_vod_snapsnot.png`;
        
        let mng = new UserNameBinarization(filename, true);
        const imgBuffer = await mng.sharpImg.buildBuffer()

        const [x, y] = [1400, 585]
        let ret = mng.checkLine(x, y, imgBuffer, 1, Direction2D.RIGHT)
        console.log(`For (${x},${y}) -> ${ret}`)
    }
);

test("Test userbox appear & length check",
    async () => {

        const filename = chatTestingFolder + 'chat_clean.png'
        // TODO: Also get the length of users and check against each
        const fileList = [
            curatedFolder + 'chat_clean.png',
            // curatedFolder + 'chat_bitrate.png',
            
            // curatedFolder + 'chat_bitrate_recover.png',
            
            // curatedFolder + 'chat_name_bg2.png',
            // curatedFolder + 'chat_clean_black.png'
            // I only have 1 full example cause he's always left-side :(
            // curatedFolder + 
        ]

        // UserNameBinarization.LINE_DEBUG = true

        for (const filename of fileList) {
            const mng = new UserNameBinarization(filename, false);
            const all_user_sw = new Stopwatch()
            const users = await mng.getUNBoundingBox(null, {appear:true, length:true});
            
            all_user_sw.stop()
            console.log(`Took ${(all_user_sw.time)} for appear+len`)

            console.log("Users List", Array.from(users.entries()).map(([idx, val]) => [idx, {A:val.appear, L:val.length}]))
            const validLens = 24
            for (const index of iterateN(validLens))
                assert.equal(users.get(index).validLength, true)
        }
    }
);

test("Test 1 userbox appear/length",
    async () => {
        const filename = getFilename(vodTestingFolder, 258)
        
        const userIdx = 12;
        // const filename = chatTestingFolder + 'chat_clean.png'

        const mng = new UserNameBinarization(filename, true);
        const all_user_sw = new Stopwatch()
        UserNameBinarization.LINE_DEBUG = true
        const users = await mng.getUNBoundingBox(new Map([[userIdx]]), {appear:true, length:true});
        
        all_user_sw.stop()
        console.log(`Len is ${users.get(userIdx).length}`)
        // OCR since I want to get the name here
    }
);

test("Test userbox quick length check",
    async () => {
        const filename = getFilename(vodTestingFolder, 401)

        const buffer = await new SharpImg(filename).sharpImg.toBuffer()
        const mng = new UserNameBinarization(buffer, true);
        const all_user_sw = new Stopwatch()
        // const users = await mng.getUNBoundingBox(new Map([[1],[2],[3],[7],[11],[12]]),
        //     {appear:true, length:true, 
        //     quickLength:new Map([[1,-200], [2,-239], [12,-177]])});
        const users = await mng.getUNBoundingBox(new Map([[17], [18]]),
            {appear:true, length:false, 
            quickLength:new Map([[17,-144], [18,-144]])});
        
        all_user_sw.stop()
        console.log(`Took ${(all_user_sw.time)} for appear+len`)
        // console.log("Users List", users.entries())
        // assert.equal(users.get(1).length, -200)
        // assert.equal(users.get(2).length, -239)
        // assert.equal(users.get(3).length, undefined)
        // assert.equal(users.get(3).lenUnavailable, false)
        // assert.equal(users.get(12).length, -177)
    }
);


test ("Test Crop user image and binarize", async () => {
    // const filename = curatedFolder+'chat_clean.png'

    const filename = getFilename(vodTestingFolder, 297)
    const userIdx = 0; // 4

    const mng = new UserNameBinarization(filename, true);
    const users = await mng.getUNBoundingBox(new Map([[userIdx]]), {appear:true, length:true})
    const userObj = users.get(userIdx)
    
    assert.equal(userObj.appear, true)
    assert.equal(userObj.lenUnavailable, false)
    assert.equal(userObj.lenUnchecked, false)
    // assert.equal(userObj.length, -222)

    if (!userObj.length) {
        assert.fail("Length not found for user")
    } else {
        console.log(`Length found for user is ${userObj.length}`)
    }
    const userCropImg = await mng.cropTrackedUserName(userObj.vidx, userObj.length)
    userCropImg.toSharp({toPNG:true}).toFile(`testing/indv_user_crop.png`)

    const binUserImg = await mng.binTrackedUserName([userCropImg])
    new SharpImg(null, binUserImg).toSharp({toPNG:true, scaleForOCR:true}).toFile(`testing/indv_user_bin.png`)

})

/*
* Its not quite linear 
* 1080x1920 = 12.86ms
* 300x900 = 10.36ms - since I need this, just not useful
* 300x500 = 7.28ms
* 300x300 = 5.61ms
*/
test ("Test sharp crop to buffer time", async () => {

    const filename = getFilename(vodTestingFolder, page)
    const iters = 200
    
    const s1 = new Stopwatch()
    for (const i of iterateN(iters)) {
        const mng = new UserNameBinarization(filename, true);
        await mng.sharpImg.buildBuffer()
    }
    console.log(`Took avg ${Stopwatch.msToHUnits(s1.read()/iters,false)}`)

    const s2 = new Stopwatch()
    for (const j of iterateN(iters)) {
        const croppedSharpImg = new SharpImg(filename).crop({x:700, y:100, w: 300, h: 900})
        await croppedSharpImg.buildBuffer()
    }
    console.log(`Took avg ${Stopwatch.msToHUnits(s2.read()/iters,false)}`)

})

test("Test userbox pure timing",
    async () => {
    // const filename = `testing/vod_dump/${page}.jpg`
    const filename = chatTestingFolder+'chat_clean.png';

    const mng = new UserNameBinarization(filename, false)
    const st_sw = new Stopwatch()
    // for (const test of Mathy.iterateN(10)) {
        await mng.getUNBoundingBox(null, {appear:false, length:true});
    // }
    console.log(`Took ${st_sw.time} for all`)

    // individual mark is faster- by about 5-7ms... why though
    // also around 48-87 -> 55.49ms
    const mng2 = new UserNameBinarization(filename, false)
    const st_sw2 = new Stopwatch()
    // for (const test of Mathy.iterateN(10)) {
        for (const i of iterateN(24)) {
            await mng2.getUNBoundingBox(new Map([[i, null]]), {appear:false, length:true})
        }
    // }
    console.log(`Took ${st_sw2.time} for all`)
}
);

test("Test chat detection", async () => {

    const filename = curatedFolder+'91.png'
    const mng = new UserNameBinarization(filename, true);
    const imgBuffer = await mng.sharpImg.buildBuffer()

    assert.equal(mng.verifyChatBlockingNames(imgBuffer), true)
})

test ("Test old binarization", {skip: "Old logic is broken"}, async () => {
    const filename = getFilename(vodTestingFolder, page)

    const imageLike = await sharp(filename).ensureAlpha().png().toBuffer()
    const mng = new UserNameBinarization(imageLike, true);
    mng.buildBuffer()
    
    const sw = new Stopwatch()
    await mng.isolateUserNames()

    console.log(`Old bin Took ${sw.time}`)
})

test ("Test ImageBuffer logic", 
{skip:"Was used for 3/4 channel testing, incomplete"}, 
async () => {
    const filename = chatTestingFolder+'chat_t2 (7).png'

    const sharpImg = new SharpImg(filename)
    const buffer = await sharpImg.buildBuffer()

    // Red pixel should show in top-left corner
    buffer.setPixel(10, 10, Color.RED)

    const [fileObjProps, file_ext] = [{toPNG:true}, '.png']
    sharpImg.toSharp(fileObjProps).toFile(testingFolder+'img_buffer'+file_ext)
})

/**
 * Reform 
 */
test ("Test user count test", async () => {
    // const filename = chatTestingFolder+'chat_t (4).png'
    const filename = ocrTestingFolder+'black_text_test.png'

    const sharpImg = new SharpImg(filename)
    // const imgBuffer = await sharpImg.buildBuffer() // build buffer first
    const ocrBuffer = await sharpImg.toSharp({toPNG:true, scaleForOCR:true}).toBuffer()

    const ocr = new NativeTesseractOCRManager(1, false, true)
    const sw = new Stopwatch()
    // let output = await mas.nativeTesseractProcess(ocrBuffer)
    const output = await ocr.performOCR(ocrBuffer)
    console.log(`Detect took ${sw.time}, Ouput: ${output.data.lines[0].text}`)
    console.log(output.data)
})


/**
 * This test just picks the first letter from user count for checking
 */
test ("Test number read", async () => {
    
    const filename = ocrTestingFolder+'full_userct.png'
    const imgBuffer = await new SharpImg(filename).buildBuffer()
    const outBuffer = imgBuffer.cloneDims()
    // const mng = new UserNameBinarization()
    const WHITE_COLORSPACE = ColorSpace.COLORS.UNSUB_WHITE

    const whitePxLine = []
    buffer: for (let x=0; x<imgBuffer.width; x++) {
        let whiteDetected = false;
        for (let y=0; y<imgBuffer.height; y++) {
            const isWhite = WHITE_COLORSPACE.check(imgBuffer.getPixel(x,y));
            if (isWhite) {
                outBuffer.setPixel(x,y, Color.BLACK)
                whiteDetected = true
            }
            // TODO: Gotta flood fill again, the actual 
        }
        whitePxLine.push(whiteDetected)
        if (whitePxLine.at(-1) == false && whitePxLine.at(-2) == true){
            // detect TRUE,FALSE at the end of detection
            break buffer
        }
    }

    new SharpImg(null, outBuffer).toSharp({toPNG:true}).toFile(ocrTestingFolder+'oneLet.png')

})

test ("Test validate pre-race screen", async () => {
    const filename = curatedFolder+'chat_clean.png';

    const mng = new UserNameBinarization(filename, true);
    assert.equal(await mng.validateMarblesPreRaceScreen(), true)
})

// NOTE: This should have a check making sure the order is consistent
//      However thats a very annoying check, I can visually determine that
//      the concurrency works and the queue is limited by output instead
test ("Test OCR Promise Queue", {skip: "Long promise queue test"}, async () => {
    const ocrm = new TestTesseractOCRManager(15, true, true);
    NativeTesseractOCRManager.PROMISE_DEBUG = true
    const list = []

    for (let i=0; i<100; i++) {
        await new Promise((r,j) => setTimeout( _ => r(), Math.random() * 100))
        list.push(ocrm.queueOCR())
    }
    await Promise.all(list)
})


test ("Test user tracker length", async () => {
    const userList = [
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername(),
        new TrackedUsername()
    ]

    userList[0].setLen(-70)
    userList[1].setLen(-168)
    userList[2].setLen(-123)
    userList[3].setLen(-126)
    userList[4].setLen(-30)
    userList[5].setLen(-84)
    // userList[6].setLen(-30)
    userList[7].setLen(-132)

    const listResult = UsernameAllTracker.genLengthChecks(userList)
    
    console.log("Heap: ", listResult)

    assert.equal(listResult[0][1], 4) // 4 is the highest score because of biggest length diff
    assert.equal(listResult.at(-1)[1], 7) // then 7 as its isolated
    assert.equal(listResult.at(-2)[1], 2) // then 2 as its a duplicate and less diff from others

    const vUsers = new Map([
        [0, new VisualUsername()],
        [1, new VisualUsername()],
        [2, new VisualUsername()],
        [3, new VisualUsername()],
        [4, new VisualUsername()],
        [5, new VisualUsername()]
    ])

    const reset = () => {
        for (const [idx, user] of vUsers)
            user.length = undefined
    }

    // test a regular match 0
    vUsers.get(1).length = -168
    vUsers.get(4).length = -30

    let offsetResult = UsernameAllTracker.findVisualOffset(userList, vUsers)
    assert.equal(offsetResult.offsetMatch, 0)
    assert.equal(offsetResult.goodMatch, true)

    // shift back 1
    reset()
    vUsers.get(0).length = -168
    vUsers.get(3).length = -30

    offsetResult = UsernameAllTracker.findVisualOffset(userList, vUsers)
    assert.equal(offsetResult.offsetMatch, 1)
    assert.equal(offsetResult.goodMatch, true)

    // shift forward 1
    reset()
    vUsers.get(2).length = -168
    vUsers.get(5).length = -30

    offsetResult = UsernameAllTracker.findVisualOffset(userList, vUsers)
    assert.equal(offsetResult.offsetMatch, -1)
    assert.equal(offsetResult.goodMatch, true)

    // undetermined, but known offset
    reset()
    vUsers.get(2).length = -168

    offsetResult = UsernameAllTracker.findVisualOffset(userList, vUsers)
    assert.equal(offsetResult.offsetMatch, -1)
    assert.equal(offsetResult.goodMatch, false)

    // no offset found
    reset()
    vUsers.get(3).length = -321
    vUsers.get(4).length = -125;

    offsetResult = UsernameAllTracker.findVisualOffset(userList, vUsers);
    assert.equal(offsetResult.offsetMatch, null)
    assert.equal(offsetResult.goodMatch, false)

})

test ("Test duplicate user tracker offsets", async () => {

    const lens = [-70, -168, -123, -123, -30, -84, undefined, -202]

    const predUsers = lens.map(
        len => {const n = new TrackedUsername(); n.setLen(len); return n})

    const vislUsers = new Map(lens.map((_, idx) => [idx, new VisualUsername()]));

    const reset = () => {
        for (const [idx, user] of vislUsers)
            user.length = undefined
    }
        
    // find offset when 1st index is a duplicate AND offset is positive
    reset()
    vislUsers.get(3).length = -123
    vislUsers.get(5).length = -30;

    let offsetResult = UsernameAllTracker.findVisualOffset(predUsers, vislUsers);
    assert.equal(offsetResult.offsetMatch, -1)
    assert.equal(offsetResult.goodMatch, true)

    // find offset when 1st index is duplicate
    reset()
    vislUsers.get(3).length = -123
    vislUsers.get(4).length = -30;

    offsetResult = UsernameAllTracker.findVisualOffset(predUsers, vislUsers);
    assert.equal(offsetResult.offsetMatch, 0)
    assert.equal(offsetResult.goodMatch, true)

    // duplicate check order
    reset()
    vislUsers.get(3).length = -123

    offsetResult = UsernameAllTracker.findVisualOffset(predUsers, vislUsers);
    assert.equal(offsetResult.offsetMatch, 0)
    assert.equal(offsetResult.goodMatch, false)
})