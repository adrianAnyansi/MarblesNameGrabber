// Jest for server functions and others

import {it, test} from 'node:test'
import assert from 'node:assert/strict'
// import { readFile } from 'node:fs';
import { readFileSync } from 'node:fs';

import {MarblesAppServer} from "../MarblesAppServer.mjs"

import { Stopwatch, iterateN } from '../UtilityModule.mjs';
import { UsernameAllTracker } from '../UsernameTrackerClass.mjs';
import { TrackedUsername, VisualUsername } from '../UserModule.mjs';
import { randChance, randInt } from '../Mathy.mjs';
import { SharpImg } from '../ImageModule.mjs';

test("Username comparisons", async () => {
    const app_server = new MarblesAppServer()
    const user_list = [
        "Aaron",
        "Emma",
        "Noah",
        "William",
        "Charlotte",
        "Rose",
        "Oscar",
        "Robin",
        "Sophia",
        "Evelyn",
        "Scarlett",
        "Naomi",
        "Brooklyn",
        "Daisy"
    ]

    const trackedUserList = []

    for (const f of iterateN(8))
        trackedUserList.push(new TrackedUsername())

    const setWithAliases = (names, user) => {
        for (const name of names)
            user.aliases.add(name)
        user.name = names.at(0)
    }

    setWithAliases(['Aaron', 'Arron'], trackedUserList[0])
    setWithAliases(['Emma'], trackedUserList[1])
    setWithAliases(['Noph', 'Noah'], trackedUserList[2])
    setWithAliases(['William'], trackedUserList[3])
    setWithAliases(['Rose'], trackedUserList[4])
    setWithAliases(['Oscar'], trackedUserList[5])
    setWithAliases(['Evelyn'], trackedUserList[7])

    app_server.usernameTracker.usersInOrder = trackedUserList
    app_server.testAgainstList(user_list)

    // does null checks, etc
})

test ("Edge Detection per index", async () => {
    // should return edge changes in value from left->right

    const testArr = [5,6,5,5,5,6,5,5,5,6]
    const edgeByIdx = UsernameAllTracker.detectEdgesPerIndex(testArr)
    const outPut =  [0,1,2,2,2,3,4,4,4,5]
    
    assert.deepEqual(outPut, edgeByIdx)

    const testArr2 =    [4,5,7,9,10,12,14,4,3,2,1]
    const edge2 =       [0,1,1,1,2,2,2,2,3,4,5]
    const out2 =        UsernameAllTracker.detectEdgesPerIndex(testArr2, 
        (v => v % 2)
    )

    assert.deepEqual(out2, edge2)
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

    const listResult = UsernameAllTracker.getVIdxToCheckByLen(userList)
    
    console.log("Heap: ", listResult)

    assert.equal(listResult[0][1], 4) // 4 is the highest score because of biggest length diff
    assert.equal(listResult.at(-1)[1], 7) // then 7 as its isolated
    assert.equal(listResult.at(-2)[1], 2) // then 2 as its a duplicate and less diff from others
    assert.equal(listResult.find( ([score, idx]) => idx == 6), undefined) // 6 should be removed as it's not considered

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


test ("Test user color detection", async () => {

    const testLen = 8;
    // const lenIter = iterateN(8)
    const predUser = []

    const BLUE = 'blue'
    const WHITE = 'white'
    const odds = [0.3, 0.7]
    const predColors = []
    for (const i of iterateN(testLen)) {
        predUser.push(new TrackedUsername())
        predColors.push(randChance(odds[0]) ? WHITE : BLUE)
        predUser[i].color = predColors[i]
    }
    
    const randomOffset = randInt(8)
    const vUser = []
    for (const i of iterateN(testLen)) {
        vUser.push(new VisualUsername())
    }
    for (const i of iterateN(testLen)) {
        // NOTE: Random chance to be null
        if (vUser[i-randomOffset])
            vUser[i-randomOffset].color = randChance(0.85) ? predColors[i] : null
        else // randoml
            vUser[testLen-(i+1)].color = randChance(odds[0]) ? WHITE : BLUE
    }
    // predUser.at(-1).color = null

    const obj = UsernameAllTracker.findColorOffset(predUser, vUser)

    console.log(`Actual Offset ${randomOffset} Got ${obj.offsetMatch}:${obj.goodMatch}`)
    console.log(`Pred   \t${predUser.map(vu => vu?.color?.padStart(5, ' ') ?? 'empty').join('|')}`)
    const pad = new Array(randomOffset)
    const space5 = '     '
    pad.fill(space5+'|', 0, randomOffset)
    console.log(`Visual \t${pad.join('')}${vUser.map(vu => vu.color?.padStart(5, ' ') ?? 'empty').join('|')}`)

    // console.log("done")
})

// -------- full server tests ------------------

test ("Appserver remote test", async () => {
    const appserver = new MarblesAppServer();
    const url = 'videos/2483071413?t=5h0m30s'

    appserver.start(url)
})

test ("Appserver local test", async () => {
    const appserver = new MarblesAppServer();
    const vod_num = 2436099273

    const marble_list_fn = `marbles_lists/list_from_${vod_num}.txt`
    appserver.ServerStatus.localListSource = marble_list_fn
    
    appserver.localTest(
        // "testing/video_clips/vod_2436099273.ts",
        "testing/vod_dump/",
        null,
        null,
        400 // actually starts around 541
    )

    // const waitTime = 60 * 1_000;
    // setTimeout( () => {
    //     appserver.stop()
    // }, waitTime)

    // appserver.testAgainstList(null, marble_list_fn)
})

test ("Appserver username compare test", async () => {
    const appserver = new MarblesAppServer();
    const vod_num = 2436099273

    const userList = JSON.parse(
        readFileSync(`testing/user_dump_${vod_num}.json`, {encoding: 'utf8'}))

    for (const user of userList) {
        const tu = new TrackedUsername()
        tu.name = user.name
        for (const a of user.aliases) {
            tu.aliases.add(a)
        }
        appserver.usernameTracker.usersInOrder.push(tu)
    }

    const marble_list_fn = `marbles_lists/list_from_${vod_num}.txt`
    appserver.testAgainstList(null, marble_list_fn)
})

test ("Appserver color local test", async () => {
    const appserver = new MarblesAppServer();

    // const vod_num = 2436099273

    appserver.localTest(
        'testing/vod_dump/',
        null,
        null,
        4400
    )

});