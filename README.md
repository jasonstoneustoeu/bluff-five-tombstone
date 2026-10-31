# Bluff Five — Tombstone Edition (Enhanced)

A phone-friendly, browser-based bluffing card game for 2–5 players. This is an unofficial fan-made project and is not affiliated with the makers or rights holders of *Tombstone*.

## What's in this version

- Visual character selection with stills associated with the 1993 film *Tombstone*.
- Character portraits beside players in the lobby and at the table.
- Host-only test player bot for trying a game alone.
- **You're a Cheat Quick Draw** button available throughout active gameplay. Any player can choose two participants to trigger a cinematic Western showdown; the card game pauses until the duel is closed.
- The showdown includes a locally bundled 3-second MP4 scene depicting a gunslinger drawing a Western pistol. After a player wins, a second animated action sequence uses the two selected player portraits to show the winning player drawing and firing, followed by a non-graphic hit reaction for the opponent. The clip and animation artwork are original generated visuals, not footage from the movie.
- The duelists race to tap **DRAW!** after the signal. An early tap loses. The loser skips their next card-game turn; a timeout has no penalty.
- After a draw result, a synchronized animated sequence shows the winning player avatar drawing a pistol, a muzzle flash and shot streak, then the opponent recoiling in a stylized puff of dust (no graphic injury).
- Works in a desktop browser or phone browser on the same network as the server.

## Run it on Windows

1. Install Node.js if needed: https://nodejs.org/
2. Extract the ZIP file.
3. Open Command Prompt or PowerShell in the extracted `bluff-five-tombstone-enhanced` folder (the folder containing `package.json`).
4. Run `npm install` once.
5. Run `npm start`.
6. Open http://localhost:3000 in a browser.
7. To join from a phone on the same Wi-Fi, open `http://YOUR-COMPUTER-IP:3000` on the phone and enter the room code. Windows Firewall may ask to allow Node.js on your private network.

## Important notes about the movie stills

The game references remotely hosted stills so that this ZIP does not redistribute the film images. Portraits require an internet connection and may stop loading if their source website changes its URL or blocks hotlinking. The stills are copyrighted by their respective owners; before publicly distributing or monetizing the game, obtain permission or replace the remote URLs with images you have rights to use. The source URLs are referenced in `public/app.js` and `server.js`.

## Gameplay notes

The **You're a Cheat Quick Draw** button remains available during the active card game. Any player may choose two duelists. Gameplay pauses during the countdown and result screen; after the result is closed, play resumes. The loser skips their next turn (including the current turn if they were due to act); if nobody draws before the timer expires, neither player is penalized.

## Claim response flow
After a player lays down cards and states their claim, the next player must make an explicit choice before taking another action:
- **Accept claim**: the claim is accepted and the responding player can then play their own cards.
- **Call bluff!**: the last play is checked; the player who lied takes the pile, or the challenger takes it if the claim was true.

A player who lays down their final card does not win until that final claim is accepted or a challenge fails. This gives everyone the chance to challenge the final play.


### Clanton character portraits
Billy Clanton and Ike Clanton are included as **two separate individual movie-still avatars**, not crops of a shared photo. Billy's still is hosted by CinemaBlend/Future CDN; Ike's still is hosted by Listal. The game references the images remotely and does not bundle or redistribute the image files. An internet connection is required; either host may change its URL or block hotlinking. The stills remain copyrighted by their respective owners. Obtain permission before public or commercial distribution.
