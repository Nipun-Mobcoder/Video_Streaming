import videojs from 'video.js';
import VideoPlayer from './VideoPlayer.js';
import { useRef, useState } from 'react';
import './App.css'
import Player from 'video.js/dist/types/player.js'
import Segment from './components/Segment.js';

function Video() {
  const playerRef = useRef<Player|null> (null);
  const videoLink = import.meta.env.VITE_VIDEO_URL

  const [URL, setURL] = useState<string>(videoLink as string)

  const videoPlayerOptions = {
    controls: true,
    responsive: true,
    fluid: true,
    autoplay: false,
    sources: [
      {
        src: URL,
        type: "application/x-mpegURL",
      },
    ],
  };

  const handlePlayerReady = (player: Player) => {
    playerRef.current = player;

    player.on("waiting", () => {
      videojs.log("Player is waiting");
    });

    player.on("dispose", () => {
      videojs.log("Player will dispose");
    });
  };

  return (
    <>
      <div>
        <h1>Video Player</h1>
      </div>
      <VideoPlayer options={videoPlayerOptions} onReady={handlePlayerReady} />
      <Segment setURL={setURL} />
    </>
  );
}

export default Video;
