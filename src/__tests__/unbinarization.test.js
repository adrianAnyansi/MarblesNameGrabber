// Jest unittest for binarization

// This 

import {it, test} from 'node:test'
import assert from 'node:assert/strict'

import { ColorSpace, UserNameBinarization } from "../UsernameBinarization.mjs";
import sharp from 'sharp'
import { Color, Direction2D, SharpImg } from '../ImageModule.mjs';
import { Stopwatch, iterateN } from '../UtilityModule.mjs';
import { LambdaOCRManager, NativeTesseractOCRManager, TestTesseractOCRManager } from '../OCRModule.mjs';
import { UsernameAllTracker } from '../UsernameTrackerClass.mjs';
import { TrackedUsername, VisualUsername } from '../UserModule.mjs';
import { randChance, randInt } from '../Mathy.mjs';

const testingFolder = String.raw`testing\\`;
const curatedFolder = String.raw`testing\curated\\`;
const chatTestingFolder = String.raw`testing\chat_testing\\`;
const vodDumpFolder = String.raw`testing\\vod_dump\\%s.jpg`
const ocrTestingFolder = String.raw`testing/ocr_test/`

const page = 303;
const vodTestFilename = getFilename(vodDumpFolder, page)

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

        // const filename = chatTestingFolder + 'chat_clean.png'
        // TODO: Also get the length of users and check against each
        const fileList = [
            // curatedFolder + 'chat_clean.png',
            // curatedFolder + 'chat_bitrate.png',
            
            // curatedFolder + 'chat_bitrate_recover.png',
            
            // curatedFolder + 'chat_name_bg2.png',
            // curatedFolder + 'chat_clean_black.png'
            getFilename(vodDumpFolder, 1024)
            // I only have 1 full example cause he's always left-side :(
            // curatedFolder + 
        ]

        // UserNameBinarization.LINE_DEBUG = true

        for (const filename of fileList) {
            const mng = new UserNameBinarization(filename, true);
            const all_user_sw = new Stopwatch()
            const users = await mng.getUNBoundingBox(null, {appear:true, length:true, color:false});
            
            all_user_sw.stop()
            console.log(`Took ${(all_user_sw.htime)} for appear+len`)

            console.log("Users List", Array.from(users.entries()).map(([idx, val]) => [idx, {A:val.appear, L:val.length}]))
            const validLens = 24
            for (const index of iterateN(validLens))
                assert.equal(users.get(index).validLength, true)
        }
    }
);

test("Test 1 userbox appear/length",
    async () => {
        const filename = getFilename(vodDumpFolder, 1027)
        
        const userIdx = 8;
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
        const filename = getFilename(vodDumpFolder, 1027)

        const buffer = await new SharpImg(filename).sharpImg.toBuffer()
        const mng = new UserNameBinarization(buffer, true);
        const all_user_sw = new Stopwatch()


        const testusers = [[8, -258], [14, -294], [16, -294]];

        const testIdxMap = new Map(testusers.map(p => [p[0]]))
        const testQLMap = new Map(testusers)
        const users = await mng.getUNBoundingBox(testIdxMap,
            {appear:true, length:false, 
            quickLength:testQLMap});
        
        all_user_sw.stop()
        console.log(`Took ${(all_user_sw.htime)} for appear+len`)
        // console.log("Users List", users.entries())
        for (const [uidx, ulen] of testusers) {
            assert.equal(users.get(uidx).length, ulen)
        }
        // assert.equal(users.get(1).length, -200)
        // assert.equal(users.get(2).length, -239)
        // assert.equal(users.get(3).length, undefined)
        // assert.equal(users.get(3).lenUnavailable, false)
        // assert.equal(users.get(12).length, -177)
    }
);

test("Test userbox quick length fail before actual length",
    async () => {
        // const filename = getFilename(vodTestingFolder, 401)
        const filename = curatedFolder + 'chat_transition_read2.png'

        const buffer = await new SharpImg(filename).sharpImg.toBuffer()
        const mng = new UserNameBinarization(buffer, true);
        const all_user_sw = new Stopwatch()

        const expectedLen = 294

        for (const len of iterateN(expectedLen+1)) {
            const usersList = await mng.getUNBoundingBox(new Map([[10]]),
                {appear:true, length:false,
                quickLength:new Map([[10,-len]])});
            
            const user = usersList.get(10)
            const validOnLen = (len == expectedLen)
            assert.equal(user.validLength, validOnLen)
            assert.equal(user.lenUnchecked, !validOnLen)
        }
        
        all_user_sw.stop()
        console.log(`Took ${(all_user_sw.htime)} for appear+len`)
    }
);

test("Test color checking", async () => {
    // const filename = curatedFolder + 'chat_clean.png'
    // const filename = curatedFolder + 'chat_super_bitrate.png'
    const filename = getFilename(vodDumpFolder, 4500)

    const mng = new UserNameBinarization(filename, true)

    const usersList = await mng.getUNBoundingBox(null, // new Map([[15]]),
        {appear:true, length:false, color: true });
    // for (const [idx, user] of usersList) {
    //     assert.equal(user.color != null, true)
    // }
});


test ("Test Crop user image and binarize", async () => {
    
    // const filename = curatedFolder+'chat_clean.png'
    const filename = getFilename(vodDumpFolder, 4503)
    const userIdx = 20; // 4

    const mng = new UserNameBinarization(filename, true);
    const users = await mng.getUNBoundingBox(new Map([[userIdx]]), {appear:true, length:true})
    const userObj = users.get(userIdx)
    
    // assert.equal(userObj.appear, true)
    // assert.equal(userObj.lenUnavailable, false)
    // assert.equal(userObj.lenUnchecked, false)
    userObj.length = -300
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

    const filename = getFilename(vodDumpFolder, page)
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
    console.log(`Took ${st_sw.htime} for all`)

    // individual mark is faster- by about 5-7ms... why though
    // also around 48-87 -> 55.49ms
    const mng2 = new UserNameBinarization(filename, false)
    const st_sw2 = new Stopwatch()
    // for (const test of Mathy.iterateN(10)) {
        for (const i of iterateN(24)) {
            await mng2.getUNBoundingBox(new Map([[i, null]]), {appear:false, length:true})
        }
    // }
    console.log(`Took ${st_sw2.htime} for all`)
}
);

test("Test chat detection", async () => {

    let filename = curatedFolder+'chat_overlay_all.png'
    let mng = new UserNameBinarization(filename, true);
    let imgBuffer = await mng.sharpImg.buildBuffer()

    assert.equal(mng.verifyChatBlockingNames(imgBuffer), true)

    filename = curatedFolder+'chat_clean.png'
    mng = new UserNameBinarization(filename, true);
    imgBuffer = await mng.sharpImg.buildBuffer()

    assert.equal(mng.verifyChatBlockingNames(imgBuffer), false)
})

test ("Test old binarization", {skip: "Old logic is broken"}, async () => {
    const filename = getFilename(vodDumpFolder, page)

    const imageLike = await sharp(filename).ensureAlpha().png().toBuffer()
    const mng = new UserNameBinarization(imageLike, true);
    mng.buildBuffer()
    
    const sw = new Stopwatch()
    await mng.isolateUserNames()

    console.log(`Old bin Took ${sw.htime}`)
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
    console.log(`Detect took ${sw.htime}, Ouput: ${output.data.lines[0].text}`)
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


test ("Test Send image for OCR Lamba", async () => {
    
    const filename = "testing/singleLineText.png"

    const lambdaOCRM = new LambdaOCRManager(10, true)
    const sharpImg = new SharpImg(filename)
    const promWait = [
        sharpImg.toSharp({toJPG:true, scaleForOCR:true}).toBuffer(),
        // sharpImg.buildBuffer() // dont need buffer but metadata
    ]
    await Promise.all(promWait)
    const jpgBuffer = (await promWait[0])
    // const jpgSharpImg = new SharpImg(jpgBuffer)
    const imgMetadata = {w:1920, h:1080}
    // const info = {w: }
    
    const lambdaRet = await lambdaOCRM.sendImgToLambda(jpgBuffer, imgMetadata, null, "unittest-job", true)
    console.log(JSON.stringify(lambdaRet))
})

test("Manual test of vod image for debug",
    async () => {

        const page = 881;

        const testObj = {
            userIdx: 16,
            // ql_test: -126,
            appear: true,
            length: true,
            color: true
        }

        const mng = new UserNameBinarization( getFilename(vodDumpFolder, page), true);
        const all_user_sw = new Stopwatch()
        UserNameBinarization.LINE_DEBUG = true

        // test Map
        let testMap = null
        if (testObj.userIdx)
            testMap = new Map([[testObj.userIdx]])
        
        const testOpts = {
            appear: testObj?.appear ?? false,
            length: testObj?.length ?? false,
            color: testObj?.color ?? false,
            quickLength: testObj.ql_test ? new Map([[testObj.userIdx, testObj.ql_test]]) : null
        }

        const users = await mng.getUNBoundingBox(testMap, testOpts);
        
        all_user_sw.stop()
        // const v_out = users
        console.log(`Visual Username out ${ Array.from(users.entries()
            .map(([idx,user]) => [idx, JSON.stringify({
                color: user.color.name,
                length: user.length,
                appear: user.appear,
                
            })])).join('\n') }`)

        // TODO: Add OCR
    }
);