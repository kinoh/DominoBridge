/// <reference path="Util.ts" />
/// <reference path="World.ts" />

enum BodyParts
{
	Trunk,
	Upperarms,
	Forearms,
	Thighs,
	Cruses,
	Head,
}
interface Pose
{
	headRadius: number;
	trunkHeight: number;
	shoulderHeight: number;
	metamereLength: number;

	translationX: number;
	translationY: number;
	angles: { [key: number /*BodyParts*/]: number[] };
}
interface BodyObject
{
	box: THREE.Object3D;
	parts: { [key: number /*BodyParts*/]: THREE.Object3D[] };
}
enum MotionKind
{
	Stop,
	Walk,
	Dash,
	Kill,
	Fall,
	Call,
	Push,
}
interface PlayerVisualState
{
	body: BodyObject;
	nameObject: THREE.Object3D;
	motion: MotionKind;
	motionSpeed: number;
	animationEpoch: number;
	prevPosition: number;
	prevTransX: number;
	prevTransY: number;
	prevAngles: { [key: number /*BodyParts*/]: number[] };
}
interface DominoVisualState
{
	object: THREE.Object3D;
	epoch: number;
	prevTransY: number;
	prevAngle: number;
}
enum SceneKind
{
	Normal,
	DominoesCollapsing,
}

class Visualizer
{
	private viewport: HTMLElement;
	private world: World;

	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private playersState: { [key: string]: PlayerVisualState } = {};
	private dominos: DominoVisualState[] = [];
	private sceneKind: SceneKind;
	private sceneEpoch: number;

	private motion: { [key: number /* MotionKind */]: Pose[] } = {};

	get Canvas(): HTMLCanvasElement
	{
		return this.renderer.domElement;
	}

	constructor(world: World, viewport: HTMLElement, size: Size)
	{
		this.viewport = viewport;
		this.world = world;

		this.initializeVisual(size);
		this.loadPoses();
	}
	private initializeVisual(size: Size): void
	{
		this.renderer = new THREE.WebGLRenderer({ antialias: true });

		if (!this.renderer)
		{
			alert("Unluckily WebGL is not supported!");
			return;
		}

		this.renderer.setSize(size.width, size.height);
		this.renderer.setClearColor(0xffffff);
		this.viewport.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();

		var bridge = new THREE.Mesh(
			new THREE.BoxGeometry(Const.BridgeWidth, Const.BridgeHeight, Const.BridgeDepth),
			new THREE.MeshBasicMaterial({ color: 0x000000 }));
		this.scene.add(bridge);
		bridge.translateX(Const.BridgeWidth / 2 - Const.BridgeLeftSpace);
		bridge.translateY(-Const.BridgeHeight / 2);

		var scale = 10;
		var ratio = size.width / size.height;
		this.camera = new THREE.OrthographicCamera(-scale * ratio, scale * ratio, scale, -scale, 1, 100);
		this.camera.position.z = 5;
		this.camera.position.y = 2;

		this.sceneKind = SceneKind.Normal;
	}
	private loadPoses(): void
	{
		var loaded: MotionKind[] = [];

		var callback = (kind: MotionKind) =>
		{
			loaded.push(kind);
			if (loaded.length === 7)
			{
				this.onLoad();
			}
		};

		this.loadMotionFile(MotionKind.Stop, "poses/stop.json", true, callback);
		this.loadMotionFile(MotionKind.Walk, "poses/walk.json", true, callback);
		this.loadMotionFile(MotionKind.Dash, "poses/dash.json", true, callback);
		this.loadMotionFile(MotionKind.Kill, "poses/kill.json", true, callback);
		this.loadMotionFile(MotionKind.Fall, "poses/fall.json", true, callback);
		this.loadMotionFile(MotionKind.Call, "poses/call.json", true, callback);
		this.loadMotionFile(MotionKind.Push, "poses/push.json", true, callback);
	}
	private loadMotionFile(kind: MotionKind, path: string, tryJsonDirect: boolean, callback: (kind: MotionKind) => void): void
	{
		if (tryJsonDirect && navigator.userAgent.indexOf("Firefox") < 0)
			tryJsonDirect = false;

		var request = new XMLHttpRequest();
		request.open("GET", path);
		request.responseType = (tryJsonDirect ? "json" : "text");
		request.addEventListener("loadend", (ev) =>
		{
			if (tryJsonDirect)
			{
				console.assert(request.response);
				this.motion[kind] = <Pose[]> request.response;
			}
			else
			{
				console.assert(!!request.responseText);
				this.motion[kind] = JSON.parse(request.responseText);
			}
			callback(kind);
		});
		try
		{
			request.send();
		} catch (e)
		{
			if (tryJsonDirect)
				this.loadMotionFile(kind, path, false, callback);
			else
				alert("Motion load failed!\n\n" + e.toString());
		}
	}
	private addPlayer(player: Player, motion?: MotionKind): void
	{
		if (player.userId in this.playersState || player.state === PlayerState.Dead)
			return;

		if (motion === undefined)
			motion = MotionKind.Stop;

		var poseSource = this.motion[motion][0];
		var pose: Pose = {
			headRadius: poseSource.headRadius,
			trunkHeight: poseSource.trunkHeight,
			shoulderHeight: poseSource.shoulderHeight,
			metamereLength: poseSource.metamereLength,
			translationX: poseSource.translationX,
			translationY: poseSource.translationY,
			angles: {}
		};
		[BodyParts.Trunk, BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses].forEach((p) =>
		{
			pose.angles[p] = [];
			for (var i = 0; i < poseSource.angles[p].length; i++)
				pose.angles[p][i] = poseSource.angles[p][i];
		});

		var metamere = new THREE.CylinderGeometry(Const.MetamereRadius, Const.MetamereRadius, pose.metamereLength);
		var material = new THREE.MeshBasicMaterial({ color: 0x000000 });

		var box = new THREE.Mesh(new THREE.PlaneBufferGeometry(0, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));

		var trunk = new THREE.Mesh(new THREE.CylinderGeometry(Const.MetamereRadius, Const.MetamereRadius, pose.trunkHeight), material);
		var head = new THREE.Mesh(new THREE.SphereGeometry(pose.headRadius), material);
		var upperarms = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var forearms = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var thighs = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var cruses = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];

		var nameParams: THREE.TextGeometryParameters = {
			//curveSegments: 0,
			font: Const.NameFont,
			height: 0.1,
			size: Const.NameSize,
		};
		var name = new THREE.Mesh(new THREE.TextGeometry(player.name, nameParams), material);
		box.add(name);
		name.translateX(Const.PlayerWidth / 2);
		name.translateY(Const.PlayerHeight / 2);

		box.add(trunk);
		trunk.add(head);
		[Side.Left, Side.Right].forEach((i) =>
		{
			trunk.add(upperarms[i]);
			upperarms[i].add(forearms[i]);

			trunk.add(thighs[i]);
			thighs[i].add(cruses[i]);
		});

		var parts: { [key: number]: THREE.Object3D[] } = {};
		parts[BodyParts.Trunk] = [trunk];
		parts[BodyParts.Head] = [head];
		parts[BodyParts.Upperarms] = upperarms;
		parts[BodyParts.Forearms] = forearms;
		parts[BodyParts.Thighs] = thighs;
		parts[BodyParts.Cruses] = cruses;
		var body: BodyObject = {
			box: box,
			parts: parts
		};

		trunk.translateX(pose.translationX);
		trunk.translateY(pose.translationY);
		trunk.rotateZ(pose.angles[BodyParts.Trunk][0]);
		head.translateY(pose.trunkHeight / 2);

		[BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses]
			.forEach((p) =>
		{
			var l: number;
			switch (p)
			{
				case BodyParts.Upperarms: l = pose.shoulderHeight; break;
				case BodyParts.Forearms: l = -pose.metamereLength / 2; break;
				case BodyParts.Thighs: l = -pose.trunkHeight / 2; break;
				case BodyParts.Cruses: l = -pose.metamereLength / 2; break;
			}
			[Side.Left, Side.Right].forEach((i) =>
			{
				body.parts[p][i].translateY(l);
				body.parts[p][i].rotateZ(pose.angles[p][i]);
				body.parts[p][i].translateY(-pose.metamereLength / 2);
			});
		});

		box.translateX(player.position);
		box.translateY(Const.PlayerHeight / 2);

		this.scene.add(body.box);

		var state: PlayerVisualState = {
			body: body,
			nameObject: name,
			motion: motion,
			motionSpeed: Infinity,
			animationEpoch: Date.now(),
			prevPosition: player.position,
			prevTransX: pose.translationX,
			prevTransY: pose.translationY,
			prevAngles: pose.angles
		};

		this.playersState[player.userId] = state;
	}
	private removePlayer(userId: string): void
	{
		this.scene.remove(this.playersState[userId].body.box);

		delete this.playersState[userId];
	}
	private renderPlayer(player: Player): void
	{
		if (!(player.userId in this.playersState))
			return;

		var state: PlayerVisualState = this.playersState[player.userId];
		var now = Date.now();

		var sign = (player.velocity >= 0 ? 1 : -1);
		var speed: number;
		if (state.motion === MotionKind.Stop || state.motion === MotionKind.Walk || state.motion === MotionKind.Dash)
		{
			speed = Const.TimePerTransPose[Math.min(Math.abs(player.velocity), Const.TimePerTransPose.length - 1)];
			if (speed !== state.motionSpeed)
			{
				if (speed < Infinity)
					state.animationEpoch = now - (now - state.animationEpoch) / state.motionSpeed * speed;
				state.motionSpeed = speed;
			}
		}
		else
			state.motionSpeed = speed = Const.TimePerPose;

		var phase = (now - state.animationEpoch) / speed;
		var index = Math.floor(phase);
		var residue = phase - index;

		switch (state.motion)
		{
			case MotionKind.Kill:
				if (index >= this.motion[state.motion].length)
					state.motion = MotionKind.Walk;
				break;
			case MotionKind.Call:
				if (index >= this.motion[state.motion].length)
					state.motion = MotionKind.Stop;
				break;
			case MotionKind.Fall:
				if (player.velocity === 0 && player.position <= -0.9 * Const.BridgeLeftSpace)
					sign = -1;
			case MotionKind.Push:
				if (index >= this.motion[state.motion].length - 1)
				{
					index = this.motion[state.motion].length - 1;
					residue = 0;
				}
				break;
			case MotionKind.Stop:
			case MotionKind.Walk:
			case MotionKind.Dash:
				if (Math.abs(player.velocity) >= Const.DashVelocityMin)
					state.motion = MotionKind.Dash;
				else if (player.velocity !== 0)
					state.motion = MotionKind.Walk;
				else
					state.motion = MotionKind.Stop;
				break;
		}

		var motion = this.motion[state.motion];
		index %= motion.length;

		[BodyParts.Trunk, BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses]
			.forEach((p) =>
		{
			for (var j = 0; j < motion[index].angles[p].length; j++)
			{
				var angle1 = motion[index].angles[p][j];
				var angle2 = motion[(index + 1) % motion.length].angles[p][j];
				var angle = angle1 + (angle2 - angle1) * residue;
				angle *= sign;

				var target = state.body.parts[p][j];

				if (p === BodyParts.Trunk)
				{
					target.rotateZ(-state.prevAngles[p][j]);
					state.body.box.translateX(-state.prevTransX);
					state.body.box.translateY(-state.prevTransY);

					var x1 = motion[index].translationX;
					var x2 = motion[(index + 1) % motion.length].translationX;
					state.prevTransX = x1 + (x2 - x1) * residue;
					var y1 = motion[index].translationY;
					var y2 = motion[(index + 1) % motion.length].translationY;
					state.prevTransY = y1 + (y2 - y1) * residue;
					state.prevTransX *= sign;

					state.body.box.translateX(state.prevTransX);
					state.body.box.translateY(state.prevTransY);
					target.rotateZ(angle);
				}
				else
				{
					target.translateY(motion[index].metamereLength / 2);
					target.rotateZ(-state.prevAngles[p][j] + angle);
					target.translateY(-motion[index].metamereLength / 2);
				}

				state.prevAngles[p][j] = angle;
			}
		});

		if (player.state !== PlayerState.Dead)
		{
			var dt = now - player.lastOrder;
			var pos = player.position + player.velocity * Const.VelocityRate * dt;
			state.body.box.translateX(-state.prevPosition + pos);
			state.prevPosition = pos;
		}
	}
	private motionStart(userId: string, motion: MotionKind): void
	{
		this.playersState[userId].animationEpoch = Date.now();
		this.playersState[userId].motion = motion;
	}
	private updateDomino(dominoSum: number): void
	{
		for (var i = this.dominos.length; i < dominoSum; i++)
		{
			var monolith = new THREE.BoxGeometry(Const.DominoWidth, Const.DominoHeight, Const.DominoDepth);
			var material = new THREE.MeshBasicMaterial({ color: 0x000000 });
			this.dominos[i] = {
				object: new THREE.Mesh(monolith, material),
				epoch: Date.now(),
				prevTransY: Const.DominoHeight / 2 + Const.DominoPopHeight,
				prevAngle: 0
			};
			this.dominos[i].object.translateX(i * Const.DominoInterval);
			this.dominos[i].object.translateY(this.dominos[i].prevTransY);
			this.scene.add(this.dominos[i].object);
		}
	}
	private renderDominoesCollapsing(): void
	{
		var now = Date.now();
		var t = now - this.sceneEpoch - Const.DominoCollapsingBegin;

		if (t < 0)
			return;

		var a;
		for (var i = 0; i < this.dominos.length; i++)
		{
			if (i === this.dominos.length - 1)
				a = Math.min(1, Math.max(0, (t - Const.DominoCollapsingInterval * i) / Const.DominoCollapsingTime)) * Math.PI / 2;
			else
				a = Math.min(1, Math.max(0, (t - Const.DominoCollapsingInterval * i) / Const.DominoCollapsingTime)) * Const.DominoCriticalPhi;

			this.dominos[i].object.translateX(Const.DominoWidth / 2);
			this.dominos[i].object.translateY(-Const.DominoHeight / 2);
			this.dominos[i].object.rotateZ(-this.dominos[i].prevAngle + -a);
			this.dominos[i].object.translateX(-Const.DominoWidth / 2);
			this.dominos[i].object.translateY(Const.DominoHeight / 2);

			this.dominos[i].prevAngle = -a;
		}
	}
	private renderDominoes(): void
	{
		if (this.sceneKind === SceneKind.DominoesCollapsing)
		{
			this.renderDominoesCollapsing();
			return;
		}

		var now = Date.now();

		for (var i = 0; i < this.dominos.length; i++)
		{
			var t = now - this.dominos[i].epoch;

			if (t > Const.DominoPopTime)
			{
				if (this.dominos[i].prevTransY !== Const.DominoHeight / 2)
				{
					this.dominos[i].object.translateY(-this.dominos[i].prevTransY + Const.DominoHeight / 2);
					this.dominos[i].prevTransY = Const.DominoHeight / 2;
				}
				continue;
			}

			var y = Const.DominoHeight / 2 + Const.DominoPopHeight * (1 - Math.pow(t / Const.DominoPopTime, 2));
			this.dominos[i].object.translateY(-this.dominos[i].prevTransY + y);
			this.dominos[i].prevTransY = y;
		}
	}
	private renderButton(): void
	{

	}
	private render(time: number): void
	{
		requestAnimationFrame((t) => { this.render(t); });

		var players = this.world.AllPlayers;

		for (var i = 0; i < players.length; i++)
			this.renderPlayer(players[i]);

		this.renderDominoes();

		if (this.sceneKind === SceneKind.DominoesCollapsing)
		{
			var t = Date.now() - this.sceneEpoch;

			if (t < Const.DominoCollapsingBegin)
			{
				if (this.world.Myself)
				this.camera.position.x = this.world.Myself.position * (1 - t / Const.DominoCollapsingBegin);
			}
			else
			{
				t -= Const.DominoCollapsingBegin;
				this.camera.position.x = Math.min(t / Const.DominoCollapsingInterval, this.world.DominoCount) * Const.DominoInterval;
			}
		}
		else if (this.world.Myself && this.world.Myself.userId in this.playersState)
		{
			var myPosition = this.playersState[this.world.Myself.userId].prevPosition;
			this.camera.position.x = myPosition;
		}

		this.renderer.render(this.scene, this.camera);
	}
	private onLoad(): void
	{
		this.camera.position.x = this.world.DominoCount * Const.DominoInterval;

		var players = this.world.AllPlayers;
		for (var i = 0; i < players.length; i++)
			this.addPlayer(players[i]);

		this.updateDomino(this.world.DominoCount);

		this.world.AddEventHandler(WorldEvent.PlayerEnter, (player) =>
		{
			this.addPlayer(player);
			this.updateDomino(this.world.DominoCount);
		});
		this.world.AddEventHandler(WorldEvent.PlayerExit, (player) =>
		{
			this.motionStart(player.userId, MotionKind.Fall);
			setTimeout(() => { this.removePlayer(player.userId); }, Const.FallenPlayerRemainTime);
		});
		this.world.AddEventHandler(WorldEvent.PlayerAttack, (player) => { this.motionStart(player.userId, MotionKind.Kill); });
		this.world.AddEventHandler(WorldEvent.PlayerCall, (player) =>
		{
			this.motionStart(player.userId, MotionKind.Call);
			setTimeout(() => { this.updateDomino(this.world.DominoCount); }, Const.CallDelay);
		});
		this.world.AddEventHandler(WorldEvent.PlayerPush, (player) =>
		{
			this.sceneKind = SceneKind.DominoesCollapsing;
			this.sceneEpoch = Date.now();
			this.motionStart(player.userId, MotionKind.Push);
		});
		this.world.AddEventHandler(WorldEvent.GameEnd, () =>
		{
			this.sceneKind = SceneKind.Normal;
			this.sceneEpoch = Date.now();
		});

		this.render(0);
	}
}
 