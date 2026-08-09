# C2 Proficiency Listening — embeds corregidos

> **Importante:** la versión anterior era incorrecta desde el Test 2 porque los IDs se reconstruyeron usando una lista externa que no correspondía exactamente con esta playlist.

Esta versión usa la **playlist real** y selecciona cada vídeo por su posición mediante la **YouTube IFrame Player API**. De esta forma no es necesario mantener una lista de IDs individuales.

- Playlist: `https://www.youtube.com/playlist?list=PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL`
- Playlist ID: `PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL`
- Tests omitidos: **24 y 25**
- La posición visible de YouTube es **1-based**.
- El parámetro `index` de la IFrame API es **0-based**.
- La playlist está ordenada al revés: **Test 1 = posición 35** y **Test 35 = posición 1**.

## Datos para el agente

```yaml
playlist_id: "PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL"
tests:
  - test: 1
    title: "C2 Proficiency Listening Test 1"
    playlist_position: 35
    api_index: 34
  - test: 2
    title: "C2 Proficiency Listening Test 2"
    playlist_position: 34
    api_index: 33
  - test: 3
    title: "C2 Proficiency Listening Test 3"
    playlist_position: 33
    api_index: 32
  - test: 4
    title: "C2 Proficiency Listening Test 4"
    playlist_position: 32
    api_index: 31
  - test: 5
    title: "C2 Proficiency Listening Test 5"
    playlist_position: 31
    api_index: 30
  - test: 6
    title: "C2 Proficiency Listening Test 6"
    playlist_position: 30
    api_index: 29
  - test: 7
    title: "C2 Proficiency Listening Test 7"
    playlist_position: 29
    api_index: 28
  - test: 8
    title: "C2 Proficiency Listening Test 8"
    playlist_position: 28
    api_index: 27
  - test: 9
    title: "C2 Proficiency Listening Test 9"
    playlist_position: 27
    api_index: 26
  - test: 10
    title: "C2 Proficiency Listening Test 10"
    playlist_position: 26
    api_index: 25
  - test: 11
    title: "C2 Proficiency Listening Test 11"
    playlist_position: 25
    api_index: 24
  - test: 12
    title: "C2 Proficiency Listening Test 12"
    playlist_position: 24
    api_index: 23
  - test: 13
    title: "C2 Proficiency Listening Test 13"
    playlist_position: 23
    api_index: 22
  - test: 14
    title: "C2 Proficiency Listening Test 14"
    playlist_position: 22
    api_index: 21
  - test: 15
    title: "C2 Proficiency Listening Test 15"
    playlist_position: 21
    api_index: 20
  - test: 16
    title: "C2 Proficiency Listening Test 16"
    playlist_position: 20
    api_index: 19
  - test: 17
    title: "C2 Proficiency Listening Test 17"
    playlist_position: 19
    api_index: 18
  - test: 18
    title: "C2 Proficiency Listening Test 18"
    playlist_position: 18
    api_index: 17
  - test: 19
    title: "C2 Proficiency Listening Test 19"
    playlist_position: 17
    api_index: 16
  - test: 20
    title: "C2 Proficiency Listening Test 20"
    playlist_position: 16
    api_index: 15
  - test: 21
    title: "C2 Proficiency Listening Test 21"
    playlist_position: 15
    api_index: 14
  - test: 22
    title: "C2 Proficiency Listening Test 22"
    playlist_position: 14
    api_index: 13
  - test: 23
    title: "C2 Proficiency Listening Test 23"
    playlist_position: 13
    api_index: 12
  - test: 26
    title: "C2 Proficiency Listening Test 26"
    playlist_position: 10
    api_index: 9
  - test: 27
    title: "C2 Proficiency Listening Test 27"
    playlist_position: 9
    api_index: 8
  - test: 28
    title: "C2 Proficiency Listening Test 28"
    playlist_position: 8
    api_index: 7
  - test: 29
    title: "C2 Proficiency Listening Test 29"
    playlist_position: 7
    api_index: 6
  - test: 30
    title: "C2 Proficiency Listening Test 30"
    playlist_position: 6
    api_index: 5
  - test: 31
    title: "C2 Proficiency Listening Test 31"
    playlist_position: 5
    api_index: 4
  - test: 32
    title: "C2 Proficiency Listening Test 32"
    playlist_position: 4
    api_index: 3
  - test: 33
    title: "C2 Proficiency Listening Test 33"
    playlist_position: 3
    api_index: 2
  - test: 34
    title: "C2 Proficiency Listening Test 34"
    playlist_position: 2
    api_index: 1
  - test: 35
    title: "C2 Proficiency Listening Test 35"
    playlist_position: 1
    api_index: 0
```

## Implementación recomendada en JavaScript

```html
<div id="youtube-player"></div>

<script src="https://www.youtube.com/iframe_api"></script>
<script>
  const PLAYLIST_ID = "PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL";

  // Cambiar este valor por el api_index del test elegido.
  // Ejemplo: Test 2 = api_index 33.
  const API_INDEX = 33;

  let player;

  function onYouTubeIframeAPIReady() {
    player = new YT.Player("youtube-player", {
      width: "100%",
      height: "480",
      playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          event.target.cuePlaylist({
            listType: "playlist",
            list: PLAYLIST_ID,
            index: API_INDEX,
            startSeconds: 0
          });
        }
      }
    });
  }
</script>
```

`cuePlaylist` deja el test preparado sin forzar autoplay. El usuario inicia la reproducción con el botón nativo de YouTube.

## Función reutilizable

```js
const PLAYLIST_ID = "PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL";

export function getListeningTestConfig(testNumber) {
  if (!Number.isInteger(testNumber) || testNumber < 1 || testNumber > 35) {
    throw new Error("testNumber must be an integer between 1 and 35");
  }

  if (testNumber === 24 || testNumber === 25) {
    throw new Error(`Listening Test ${testNumber} is incomplete and has been omitted`);
  }

  const playlistPosition = 36 - testNumber; // 1-based
  const apiIndex = playlistPosition - 1;     // 0-based

  return {
    test: testNumber,
    title: `C2 Proficiency Listening Test ${testNumber}`,
    playlistId: PLAYLIST_ID,
    playlistPosition,
    apiIndex
  };
}
```

## Ejemplo de componente React

```jsx
import { useEffect, useId, useRef } from "react";

const PLAYLIST_ID = "PL1VgFeDQB-hD8LMDsiJ5Oa7v-BEJAi7nL";

function getApiIndex(testNumber) {
  if (!Number.isInteger(testNumber) || testNumber < 1 || testNumber > 35) {
    throw new Error("Invalid listening test number");
  }
  if (testNumber === 24 || testNumber === 25) {
    throw new Error("Tests 24 and 25 are incomplete");
  }
  return 35 - testNumber;
}

export default function YouTubeListeningPlayer({ testNumber }) {
  const reactId = useId();
  const elementId = `youtube-player-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function createPlayer() {
      if (cancelled || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(elementId, {
        width: "100%",
        height: "480",
        playerVars: {
          enablejsapi: 1,
          playsinline: 1,
          rel: 0
        },
        events: {
          onReady: (event) => {
            event.target.cuePlaylist({
              listType: "playlist",
              list: PLAYLIST_ID,
              index: getApiIndex(testNumber),
              startSeconds: 0
            });
          }
        }
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [elementId, testNumber]);

  return (
    <div
      id={elementId}
      aria-label={`C2 Proficiency Listening Test ${testNumber}`}
    />
  );
}
```

## Correspondencia comprobable

| Test | Posición en playlist | `api_index` |
|---:|---:|---:|
| 1 | 35 | 34 |
| 2 | 34 | 33 |
| 3 | 33 | 32 |
| 4 | 32 | 31 |
| 5 | 31 | 30 |
| 6 | 30 | 29 |
| 7 | 29 | 28 |
| 8 | 28 | 27 |
| 9 | 27 | 26 |
| 10 | 26 | 25 |
| 11 | 25 | 24 |
| 12 | 24 | 23 |
| 13 | 23 | 22 |
| 14 | 22 | 21 |
| 15 | 21 | 20 |
| 16 | 20 | 19 |
| 17 | 19 | 18 |
| 18 | 18 | 17 |
| 19 | 17 | 16 |
| 20 | 16 | 15 |
| 21 | 15 | 14 |
| 22 | 14 | 13 |
| 23 | 13 | 12 |
| 26 | 10 | 9 |
| 27 | 9 | 8 |
| 28 | 8 | 7 |
| 29 | 7 | 6 |
| 30 | 6 | 5 |
| 31 | 5 | 4 |
| 32 | 4 | 3 |
| 33 | 3 | 2 |
| 34 | 2 | 1 |
| 35 | 1 | 0 |

## Archivo JSON

El archivo JSON adjunto contiene la misma correspondencia para que el agente pueda importarla o transformarla directamente.
