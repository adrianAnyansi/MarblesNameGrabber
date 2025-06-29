# TODO.md
I think this is the 3rd month of working on this project. 
I'm going to cut my losses and switch projects.

This is actually 0.3.2 version, I gotta get used to this
Idea is no more text recognition improvements, just production release.


# 0.3 Goal - Track Every Username
---
By checking every frame, every name should be tracked individually.
This means I can track each user on screen without OCR and with near perfect accuracy.

[-] Username Prediction
    This was assumed to support the username tracking, but its too unstable (both real data and ability to track enter/exit times).
[x] Length detection
    Seems as reliable as I can make it.
    - Also added quickLength which is much much faster for offset testing
[?] Color detection
    Added to support low bit-rate situations, but still undergoing testing

I'm going to eat the other problems to launch.

## Future improvements
[ ] Website improvements
    [ ] User page
        - User feedback, the likely/unlikely is still confusing to users. I'm going to move this server-side and make something more solid.
        - Add captcha to help identifying users.
        - Live feed for players? I do not want to update
        - Show names close to the entered name
        - Show recognized names
    [ ] Admin page, I would more feedback, controls, etc.
        - I want live feed animated (cause its cool and I need that feedback)
        - I want captcha as well
        - Force/quit/reset controls
        - Some ability to add manual users, but this will be near impossible to track
        - Some easy password management + local storage
[ ] OCR 
    A manual OCR will stop confidence levels being max 70-80% and remove some char issues. It's a big undertaking so very unlikely.
    [OCR](/Implementation.md#ocr-notes)
[ ] Number OCR
    Develop number OCR to use this as a 2nd-ary track for users on screen.
[ ] Overlay detection
    - Detect overlay by chat
        - Figure out chat removal/reduction
    - Detect alert position
    - Detect Barb position
[ ] Use Prediction
    - Could use prediction knowing 26 names scroll in a full scroll
    - Other use-cases

## Think about
- Instead of length check, limit by ms? 
    - Far more reliable for keeping time, but I can accept slow down as long as it runs sequentially
    - Also doesn't recover the same way
    - Since most of the issue is in the buffer, I probably can't save this anyway
- Need to track and save images whenever OCR fails/reads nothing
    - useful for debug and to help track names that don't get binarized correctly
- When to do temporal, and is this accurate?
    - I think I might not need this since most names are on screen CLEAN at some point
- Stopping mechanism without OCR? Oh I can just match the 1000/1000 check + old check
    - Just use old check, time-based after first name read

## Steps to 0.3
[x] Update FPS and reduce processing for string
[x] Server & Code refactoring
    [x] Tracking length/offset code
    [x] Move OCR out of server & make generic
    [x] Use imageBuffer/sharp in binarization
    [x] Use classes for server state and etc
[x] Write functions to calculate the length by outline
[x] Complete user tracking via length
[x] Tweak OCR values to increase OCR confidence
[?] Update lambda to use the new functions
[ ] Production testing
[ ] Update UI + admin page

## Current issues/bugs
[-] -290 crop logic needs testing, the PLAY button scale needs to be tracked, I could do this by checking the bounding box.
    However this is only missing 1/2 letters so I will ignore.
[ ] write quick-box logic?
[ ] draw up website improvement
[ ] 


# Current Thoughts
The only issues now are 
1. usernames get cut off by Barb's head
2. I want % match or smth, I don't want people complaining

The colour tests are annoying. Ignoring that
All the improved debugging has been implemented
I'm ignoring the debug page since it's likely I won't have time 
    Both to use it and implement it
Verify I'm also leaving as its annoying

Once the UI is done I'll launch and leave this 

# Vod testing results
Im not going to hit 100% on the vod bitrate test, so I'll talk about the current issues in vod 2436099273.
- match mean = 0.57
- non-zero mean = 50.55
- 7-25 names lost to bitrate; considered unreadable without knowing chat names
- 2-3 names lost to OCR (think lIs or multiple underscores)

- Need index to show 
    - Names that have position but are unreadable
    - User list needs to flag names considered unreadable for my peace-of-mind

- Color detection
    - This still appears to have some issues. This can be debugged with more time and logging, but a bad match should never occur so I'm worried about that logic
- Reduce color detection passes by using the edge detection code

Will leave this problem for later
2. On low bitrate, the color gradient means a low confidence on the pixels.
    so likely multiple overlays might not help.
    I should increase the colorspace instead.

check 6521, 6612, 6613, 6625, 6644, 6645
I can put new logic that ignores 1 random length match.

# Focus today

- Finishing up website

- Need quick box for OCR cause Barb hair is blocking 90%
- Show the

- debug to show all user names for an index?
    - admin page can do this

- figure out a userAlias data structure
- verify code
    - yes/no for username search
    - create a mode that allows verifying + adding new names

- for user find, save the last searched userObj and results to cache
    - For this cache, I need to override if aliases have been updated which means 
    that the those names need to be done.
    I'm not sure how to do this well, probably a retro-active dirty flag that forces a check?
    since this happens with multiple checks, there's not a really a good way to rule this out.
    Ok best to just flag post-name updates and then always check them

- user feedback needs match percentage
- gotta fix the found/tracked username backend
- sometimes length can be wrong, after 3+ checks it should retry?

- test a clear -> restart