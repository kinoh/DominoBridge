/// <reference path="Util.ts" />
/// <reference path="World.ts" />

class SoundEffecter
{
	private world: World;
	private audio: AudioContext;
	private soundBuffer: AudioBuffer[] = [];

	constructor(world: World)
	{
		(<any> window).AudioContext = (<any> window).AudioContext || (<any> window).webkitAudioContext;	// Fuckin' curse!

		this.audio = new AudioContext();
		this.world = world;

		this.loadSounds();

		world.AddEventHandler(WorldEvent.PlayerExit, (_) => { this.playSound(WorldEvent.PlayerExit, Const.FallingPlayerDanceTime); });
		world.AddEventHandler(WorldEvent.PlayerCall, (_) => { this.playSound(WorldEvent.PlayerCall, Const.CallDelay + Const.DominoPopTime); });

		world.AddEventHandler(WorldEvent.PlayerPush, (_) =>
		{
			for (var i = 0; i < world.DominoCount; i++)
				this.playSound(WorldEvent.PlayerCall,
					Const.DominoCollapsingBegin + i * Const.DominoCollapsingInterval);
		});
	}
	private onLoad(): void
	{

	}
	private loadSounds(): void
	{
		var loaded: number[] = [];

		var callback = (index: number) =>
		{
			loaded.push(index);
			if (loaded.length === 2)
			{
				this.onLoad();
			}
		};

		this.loadSoundFile(WorldEvent.PlayerCall, "sounds/put.ogg", callback);
		this.loadSoundFile(WorldEvent.PlayerExit, "sounds/fall.ogg", callback);
	}
	private loadSoundFile(index: number, url: string, callback: (index: number) => any): void
	{
		var request = new XMLHttpRequest();
		request.open("GET", url, true);
		request.responseType = "arraybuffer";

		request.onload = () =>
		{
			this.audio.decodeAudioData(request.response, (buffer) =>
			{
				this.soundBuffer[index] = buffer;
				callback(index);
			});
		}
		request.send();
	}
	private playSound(index: number, delay: number = 0): void
	{
		var source = this.audio.createBufferSource();
		source.buffer = this.soundBuffer[index];
		source.connect(this.audio.destination);
		source.start(this.audio.currentTime + delay / 1000);
	}
}
