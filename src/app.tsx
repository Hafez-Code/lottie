import { Show } from 'solid-js';
import { SceneChat } from '@/components/scene-chat';
import { PlaybackControls } from '@/components/playback-controls';
import { ScenesContainer } from '@/components/scenes-container';
import { SidebarRight } from '@/components/sidebar-right';
import { useUI } from '@/context/ui';
import { PreviewWorker } from '@/components/preview-worker';

export function App() {
  const { controlsExpanded } = useUI();

  return (
    <>
      <PreviewWorker />
      <SceneChat />
      <div class="absolute left-[332px] right-[268px] bottom-4 flex flex-col items-center gap-4 px-4">
        <PlaybackControls />
        <Show when={controlsExpanded()}>
          <ScenesContainer />
        </Show>
      </div>
      <SidebarRight />
    </>
  );
};
