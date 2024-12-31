/* eslint-disable @typescript-eslint/no-unused-expressions */
import { useRef, useEffect } from "react";
import videojs from "video.js";
import Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";

interface optionType {
  controls: boolean;
  responsive: boolean;
  fluid: boolean;
  autoplay: boolean | "play" | "muted" | "any";
  sources: {
      src: unknown;
      type: string;
  }[];
}

export const VideoPlayer = (props: { options: optionType, onReady: (player: Player)=>void }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player|null>(null);
  const { options, onReady } = props;

  useEffect(() => {
    if (!playerRef.current) {
      const videoElement = document.createElement("video-js");

      videoElement.classList.add("vjs-big-play-centered");
      videoRef?.current?.appendChild(videoElement);

      const player = (playerRef.current = videojs(videoElement, options, () => {
        videojs.log("player is ready");
        onReady && onReady(player);
      }));
    } else {
      const player = playerRef.current;

      player.autoplay(options.autoplay);
      player.src(options.sources);
    }
  }, [onReady, options, videoRef]);

  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
    <div
      data-vjs-player
      style={{ width: "1200px" }}
    >
      <div ref={videoRef} />
    </div>
  );
};

export default VideoPlayer;