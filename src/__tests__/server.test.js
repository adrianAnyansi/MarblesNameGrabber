// Jest for server functions and others

import {it, test} from 'node:test'
import assert from 'node:assert/strict'
// import { readFile } from 'node:fs';
import { readFileSync } from 'node:fs';

import {MarblesAppServer} from "../MarblesAppServer.mjs"

import { Stopwatch, iterateN } from '../UtilityModule.mjs';
import { TrackedUsername, UsernameAllTracker } from '../UsernameTrackerClass.mjs';

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

test ("Appserver local test", async () => {
    const appserver = new MarblesAppServer();

    const vod_num = 2436099273

    const marble_list_fn = "marbles_lists/list_from_2436099273.txt"
    appserver.ServerStatus.localListSource = marble_list_fn
    // appserver.localTest(
    //     "testing/video_clips/vod_2436099273.ts",
    //     null,
    //     null,
    //     null
    // )
    
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

    appserver.testAgainstList(null, marble_list_fn)

})