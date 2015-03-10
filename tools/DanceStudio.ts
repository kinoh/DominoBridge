enum Side
{
	Left = 0,
	Right = 1
};

class DanceStudio
{
	private viewport: HTMLElement;
	private info: HTMLElement;
	private out: HTMLElement;

	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.Camera;

	private count: number;
	private dancers: Pose[];
	private bodies: BodyObject[];

	private activeIndex: number;
	private rotateTarget: BodyParts;
	private rotateTargetSide: Side;

	private animation: boolean = false;
	private animationEpoch: number;
	private animationSpeed: number;
	private animationLastTransX: number;
	private animationLastTransY: number;
	private animationLastAngles: { [key: number /*BodyParts*/]: number[] };

	constructor(viewport: HTMLElement, size: Size, info: HTMLElement, out: HTMLElement)
	{
		this.viewport = viewport;
		this.info = info;
		this.out = out;
		this.count = 0;
		this.dancers = [];
		this.bodies = [];

		this.initializeWebGL(size);

		this.load();
	}
	private initializeWebGL(size: Size): void
	{
		this.renderer = new THREE.WebGLRenderer({ antialias: true });

		if (!this.renderer)
		{
			alert("Unluckily WebGL is not supported!");
			return;
		}

		this.renderer.setSize(size.width, size.height);
		this.renderer.setClearColor(0x333333);
		this.viewport.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();

		var scale = 20;
		var ratio = size.width / size.height;
		this.camera = new THREE.OrthographicCamera(-scale * ratio, scale * ratio, scale, -scale, 1, 100);
		this.camera.position.z = 5;
	}
	private render(time: number): void
	{
		requestAnimationFrame((t) => { this.render(t); });

		if (this.animation)
		{
			var n = this.count - 1;
			var t = Date.now() - this.animationEpoch;
			var index = Math.floor(t / this.animationSpeed);
			var residue = t / this.animationSpeed - index;
			index %= n;

			var l = this.dancers[n].metamereLength / 2;

			[BodyParts.Trunk, BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses].forEach((p) =>
			{
				for (var j = 0; j < this.dancers[n].angles[p].length; j++)
				{
					var angle1 = this.dancers[index].angles[p][j];
					var angle2 = this.dancers[(index + 1) % n].angles[p][j];
					var angle = angle1 + (angle2 - angle1) * residue;

					var target = this.bodies[n].parts[p][j];

					if (p === BodyParts.Trunk)
					{
						target.rotateZ(-this.animationLastAngles[p][j]);
						target.translateX(-this.animationLastTransX);
						target.translateY(-this.animationLastTransY);
						this.animationLastTransX = this.dancers[index].translationX + (this.dancers[(index + 1) % n].translationX - this.dancers[index].translationX) * residue;
						this.animationLastTransY = this.dancers[index].translationY + (this.dancers[(index + 1) % n].translationY - this.dancers[index].translationY) * residue;
						target.translateX(this.animationLastTransX);
						target.translateY(this.animationLastTransY);
						target.rotateZ(angle);
					}
					else
					{
						target.translateY(l);
						target.rotateZ(-this.animationLastAngles[p][j] + angle);
						target.translateY(-l);
					}

					this.animationLastAngles[p][j] = angle;
				}
			});
		}

		this.renderer.render(this.scene, this.camera);
	}
	private beginAnimation(msecPerFrame: number): void
	{
		if (this.animation)
			return;

		this.animation = true;
		this.animationEpoch = Date.now();
		this.animationSpeed = msecPerFrame;
		this.addDancer(this.dancers[0]);
		this.animationLastTransX = this.dancers[this.activeIndex].translationX;
		this.animationLastTransY = this.dancers[this.activeIndex].translationY;
		this.animationLastAngles = {};
		[BodyParts.Trunk, BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses].forEach((p) =>
		{
			this.animationLastAngles[p] = [];
			for (var j = 0; j < this.dancers[this.activeIndex].angles[p].length; j++)
				this.animationLastAngles[p][j] = this.dancers[this.activeIndex].angles[p][j];
		});
	}
	private endAnimation()
	{
		if (!this.animation)
			return;

		this.animation = false;
		this.removeDancer();
	}
	private changeFocus(newIndex?: number): void
	{
		if (newIndex === undefined)
			newIndex = (this.activeIndex + 1) % this.count;

		if (this.activeIndex == newIndex)
			return;

		if (this.activeIndex >= 0)
		{
			this.bodies[this.activeIndex].box.translateY(-5);
			this.bodies[this.activeIndex].box.translateX(-10 + 5 * this.activeIndex);
		}

		this.bodies[newIndex].box.translateX(10 - 5 * newIndex);
		this.bodies[newIndex].box.translateY(5);

		this.activeIndex = newIndex;
	}
	private addDancer(pose?: Pose): number
	{
		if (!pose)
		{
			pose = {
				headRadius: 0.3,
				trunkHeight: 1.5,
				shoulderHeight: 0.3,
				metamereLength: 0.5,
				translationX: 0,
				translationY: 0,
				angles: {}
			};
			pose.angles[BodyParts.Trunk] = [0];
			pose.angles[BodyParts.Upperarms] = [-Math.PI / 6, Math.PI / 6];
			pose.angles[BodyParts.Forearms] = [Math.PI / 8, -Math.PI / 8];
			pose.angles[BodyParts.Thighs] = [-Math.PI / 8, Math.PI / 8];
			pose.angles[BodyParts.Cruses] = [Math.PI / 12, -Math.PI / 12];
		}
		else
			pose = JSON.parse(JSON.stringify(pose));	// Easy dirty deep-copy

		if (this.activeIndex >= 0)
		{
			this.bodies[this.activeIndex].box.translateY(-5);
			this.bodies[this.activeIndex].box.translateX(-10 + 5 * this.activeIndex);
		}

		var metamere = new THREE.CylinderGeometry(0.02, 0.02, pose.metamereLength);
		var material = new THREE.MeshBasicMaterial({ color: 0x000000 });

		var box = new THREE.Mesh(new THREE.PlaneBufferGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));

		var baseline = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), material);
		box.add(baseline);
		baseline.translateY(-1.7);

		var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, pose.trunkHeight), material);
		var head = new THREE.Mesh(new THREE.SphereGeometry(pose.headRadius), material);
		var upperarms = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var forearms = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var thighs = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];
		var cruses = [new THREE.Mesh(metamere, material), new THREE.Mesh(metamere, material)];

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

		box.translateY(2.5);
		trunk.translateX(pose.translationX);
		trunk.translateY(pose.translationY);
		trunk.rotateZ(pose.angles[BodyParts.Trunk][0]);
		head.translateY(pose.trunkHeight / 2);
		[BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses].forEach((p) =>
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

		this.scene.add(body.box);

		var i = this.count;
		this.dancers[i] = pose;
		this.bodies[i] = body;
		this.activeIndex = i;

		this.count++;

		return this.activeIndex;
	}
	private removeDancer(): void
	{
		if (this.count == 1)
			return;

		var i = this.activeIndex;

		this.changeFocus(i == this.count - 1 ? i - 1 : i + 1);

		this.scene.remove(this.bodies[i].box);

		delete this.dancers[i];
		delete this.bodies[i];
		for (var j = i + 1; j < this.count; j++)
		{
			this.dancers[j - 1] = this.dancers[j];
			this.bodies[j - 1] = this.bodies[j];
			if (j != this.activeIndex)
				this.bodies[j - 1].box.translateX(-5);
		}
		this.count--;
		if (i < this.count)
		{
			delete this.dancers[this.count];
			delete this.bodies[this.count];
			this.activeIndex--;
		}
	}
	private rotatePart(angle: number): void
	{
		var displace = 0;
		var target = this.bodies[this.activeIndex].parts[this.rotateTarget][this.rotateTargetSide];

		if (this.rotateTarget != BodyParts.Trunk)
			displace = this.dancers[this.activeIndex].metamereLength / 2;

		target.translateY(displace);
		target.rotateZ(angle);
		target.translateY(-displace);

		this.dancers[this.activeIndex].angles[this.rotateTarget][this.rotateTargetSide] += angle;
	}
	private translate(x: number, y: number): void
	{
		var target = this.bodies[this.activeIndex].parts[BodyParts.Trunk][0];

		target.rotateZ(-this.dancers[this.activeIndex].angles[BodyParts.Trunk][0]);
		target.translateX(x);
		target.translateY(y);
		target.rotateZ(this.dancers[this.activeIndex].angles[BodyParts.Trunk][0]);

		this.dancers[this.activeIndex].translationX += x;
		this.dancers[this.activeIndex].translationY += y;
	}
	private mirror(): void
	{
		var pose: Pose = {
			headRadius: this.dancers[this.activeIndex].headRadius,
			trunkHeight: this.dancers[this.activeIndex].trunkHeight,
			shoulderHeight: this.dancers[this.activeIndex].shoulderHeight,
			metamereLength: this.dancers[this.activeIndex].metamereLength,
			translationX: -this.dancers[this.activeIndex].translationX,
			translationY: this.dancers[this.activeIndex].translationY,
			angles: {}
		};
		pose.angles[BodyParts.Trunk] = [-this.dancers[this.activeIndex].angles[BodyParts.Trunk][0]];
		[BodyParts.Upperarms, BodyParts.Forearms, BodyParts.Thighs, BodyParts.Cruses].forEach((p) =>
		{
			pose.angles[p] = [];
			for (var i = 0; i < 2; i++)
				pose.angles[p][i] = -this.dancers[this.activeIndex].angles[p][1 - i];
		});
		this.dancers[this.activeIndex] = pose;
	}
	private output(): void
	{
		var data = JSON.stringify(this.dancers, null, "\t");

		this.out.textContent = data;

		localStorage.setItem("DanceData", data);
	}
	private load(): void
	{
		var query = window.location.search.substr(1);
		if (query)
		{
			var request = new XMLHttpRequest();
			request.open("GET", query);
			request.responseType = "json";
			request.addEventListener("loadend", (ev) => {
				if (request.response)
				{
					var dancers = <Pose[]> request.response;
					for (var i in dancers)
					{
						if (dancers[i])
						{
							if (!dancers[i].translationX)
								dancers[i].translationX = 0;
							if (!dancers[i].translationY)
								dancers[i].translationY = 0;
							this.addDancer(dancers[i]);
						}
					}
				}
				this.onLoad();
			});
			try
			{
				request.send();
			} catch (e)
			{
				console.error(e.toString());
			}
		}
		else
		{
			this.loadLocalStorage();
			this.onLoad();
		}
	}
	private onLoad(): void
	{
		if (this.count == 0)
			this.addDancer();

		this.rotateTarget = BodyParts.Trunk;
		this.rotateTargetSide = 0;

		this.render(0);

		window.onkeydown = (e) => { this.onKeyDown(e); };
	}
	private loadLocalStorage(): void
	{
		var data = localStorage.getItem("DanceData");

		this.out.textContent = data;

		if (!data)
			return;

		var dancers = <Pose[]> JSON.parse(data);

		if (!dancers)
		{
			alert("Load failed!");
			return;
		}

		for (var i in dancers)
		{
			if (dancers[i])
				this.addDancer(dancers[i]);
		}
	}
	private inform(message: string): void
	{
		this.info.textContent = message;
	}
	private onKeyDown(e: KeyboardEvent): void
	{
		if (e.ctrlKey)
			return;

		var i = this.activeIndex;
		var keyCaught = true;
		var key = Keyboard.Tell(e);

		switch (key)
		{
			case "[Tab]":
				if (e.shiftKey)
					this.changeFocus(this.activeIndex === 0 ? this.count - 1 : this.activeIndex - 1);
				else
					this.changeFocus();
				break;
			case "[Left]":
				if (this.rotateTarget === BodyParts.Head)
					this.translate(-0.1, 0);
				else
					this.rotatePart(-0.1);
				break;
			case "[Right]":
				if (this.rotateTarget === BodyParts.Head)
					this.translate(0.1, 0);
				else
					this.rotatePart(0.1);
				break;
			case "[Up]":
				if (this.animation && this.animationSpeed > 10)
					this.animationSpeed -= 10;
				else if (this.rotateTarget === BodyParts.Head)
					this.translate(0, 0.1);
				break;
			case "[Down]":
				if (this.animation)
					this.animationSpeed += 10;
				else if (this.rotateTarget === BodyParts.Head)
					this.translate(0, -0.1);
				break;
			case "n":
				this.addDancer();
				break;
			case "c":
				this.addDancer(this.dancers[this.activeIndex]);
				break;
			case "d":
				this.removeDancer();
				break;
			case "m":
				if (!this.animation)
					this.beginAnimation(200);
				else
					this.endAnimation();
				break;
			case "o":
				this.output();
				break;
			case "0":
				this.rotateTarget = BodyParts.Head;
				this.inform("平行移動");
				break;
			case "1":
				this.rotateTarget = BodyParts.Trunk;
				this.rotateTargetSide = 0;
				this.inform("體幹");
				break;
			case "2":
			case "3":
				this.rotateTarget = BodyParts.Upperarms;
				this.rotateTargetSide = (key === "2" ? Side.Left : Side.Right);
				this.inform(["左", "右"][this.rotateTargetSide] + "上腕");
				break;
			case "4":
			case "5":
				this.rotateTarget = BodyParts.Forearms;
				this.rotateTargetSide = (key === "4" ? Side.Left : Side.Right);
				this.inform(["左", "右"][this.rotateTargetSide] + "前腕");
				break;
			case "6":
			case "7":
				this.rotateTarget = BodyParts.Thighs;
				this.rotateTargetSide = (key === "6" ? Side.Left : Side.Right);
				this.inform(["左", "右"][this.rotateTargetSide] + "大腿");
				break;
			case "8":
			case "9":
				this.rotateTarget = BodyParts.Cruses;
				this.rotateTargetSide = (key === "8" ? Side.Left : Side.Right);
				this.inform(["左", "右"][this.rotateTargetSide] + "下腿");
				break;
			default:
				keyCaught = false;
				console.debug(["uncaught key: ", key, " (", e.keyCode, ")"].join(""));
				break;
		}

		if (keyCaught)
			e.preventDefault();
	}
}

window.onload = function ()
{
	var viewport = document.getElementById("viewport");
	var info = document.getElementById("info");
	var output = document.getElementById("output");
	var size: Size = { width: 0.9 * window.innerWidth, height: 0.9 * window.innerHeight };

	var studio = new DanceStudio(viewport, size, info, output);
};