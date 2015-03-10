/// <reference path="Util.ts" />

enum PlayerState
{
	Normal,
	Attack,
	Call,
	Dead,
	Push,
	Lose,
}

interface Player
{
	name: string;
	userId: string;
	lastOrder: number;
	position: number;
	velocity: number;
	state: PlayerState;
	dominoes: number;
}

enum WorldEvent
{
	PlayerEnter,
	PlayerExit,
	PlayerAttack,
	PlayerCall,
	PlayerPush,
	GameEnd,
}

interface ActionTrial
{
	action: string;
	time: number;
	ack: number;
	deny: number;
	data: any;
}
interface Message
{
	senderId: string;
	destId: string;
	action: string;
	data: any;
	signature?: string;
}

interface ScoreRecord
{
	name: string;
	dominoes: number;
	time: number;
	participants: number;
}

class Const
{
	public static BridgeWidth = 1000;
	public static BridgeHeight = 1;
	public static BridgeDepth = 1;
	public static BridgeLeftSpace = 3;

	public static TimePerPose = 100;
	public static TimePerTransPose = [Infinity, 200, 150, 100, 80, 65, 50, 40, 30];
	public static DashVelocityMin = 5;
	public static VelocityRate = 0.001;     // actual velocity = Const.VelocityRate * velocity
	public static MetamereRadius = 0.02;
	public static FallenPlayerRemainTime = 1500;
	public static FallingPlayerDanceTime = 400;
	public static CallDelay = 300;

	public static NameFont = "helvetiker";
	public static NameSize = 0.4;

	public static DominoWidth = 0.5;
	public static DominoHeight = 3;
	public static DominoDepth = 1.2;
	public static DominoPopHeight = 0.3;
	public static DominoPopTime = 100;
	public static DominoInterval = 1.2;
	public static DominoCollapsingTime = 200;
	public static DominoCollapsingBegin = 300;
	public static DominoCriticalPhi = Math.acos(Const.DominoWidth / Const.DominoInterval);
	public static DominoCollapsingInterval = Math.asin((Const.DominoInterval - Const.DominoWidth) / Const.DominoHeight) / Const.DominoCriticalPhi * Const.DominoCollapsingTime;

	public static PlayerHeight = 3.4;
	public static PlayerWidth = 0.4;
	public static PlayerDampingTime = [0, 100, 200, 400, 600, 600];
	public static AttackRange = 0.7;
	public static CallRange = 5;
	public static MoveAcceleratableTime = 0.3;
	public static ExpulsionBorder = 0.5;

	public static RSABitLength = 512;
	public static RSAPublicExponent = "10001";
	public static TrialTime = 300;
	public static SignatureParam = { "alg": "SHA1withRSA", "prov": "cryptojs/jsrsa" };
	public static SignatureAvailTime = 1000;
	public static TimeSynchroTime = 8;
}

class World
{
	private standalone = false;

	private milkcocoa: MilkCocoa;
	private playersDataStore: milkcocoa.DataStore;
	private mySecret: RSAKey;
	private myId: string;
	private players: { [key: string]: Player } = {};
	private timeDiff: { [key: string]: number } = {};
	private lastMessage: { [key: string]: number } = {};
	private publicKeys: { [key: string]: RSAKey } = {};
	private actionTrial: { [key: string]: ActionTrial } = {};
	private gameEnded: boolean = false;
	private scoreRecords: ScoreRecord[] = [];

	private eventHandlers: { [key: number /* WorldEvent */]: (player: Player) => void } = {};
	private lastMove: number = 0;
	private moveKeyPressed: boolean = false;
	private rall: number = 0;
	private fallHandler: number = 0;

	get CurrentTime(): number
	{
		return Date.now();
	}
	get AllPlayers(): Player[]
	{
		return Object.keys(this.players).map((key) => { return this.players[key]; });
	}
	get LivingPlayerCount(): number
	{
		return Object.keys(this.players).filter((key) => { return this.players[key].state !== PlayerState.Dead; }).length;
	}
	get DominoCount(): number
	{
		return Object.keys(this.players).reduce((prev: number, curr: string) => { return prev + this.players[curr].dominoes; }, 0);
	}
	get Myself(): Player
	{
		return this.myId ? this.players[this.myId] : null;
	}
	get MyPublicKey(): RSAKey
	{
		console.assert(this.myId in this.publicKeys);
		return this.publicKeys[this.myId];
	}

	constructor(standbyCallback?: () => any)
	{
		if (this.standalone)
			this.enter("");
		else
		{
			try
			{
				this.connect(standbyCallback);
			} catch (e)
			{
				alert("Connection failed!\n\n" + e.toString());
			}
		}
	}
	private connect(callback?: () => any): void
	{
		this.mySecret = new RSAKey();
		this.mySecret.generate(Const.RSABitLength, Const.RSAPublicExponent);

		this.milkcocoa = new MilkCocoa("https://io-di6nnlt8d.mlkcca.com");
		if (!this.milkcocoa)
		{
			alert("Connection failed!");
			return;
		}

		this.milkcocoa.anonymous((err, user) =>
		{
			if (err)
			{
				alert("Log-in failed!");
				return;
			}

			this.myId = user.id;

			this.playersDataStore = this.milkcocoa.dataStore("players");

			var pub = this.mySecret.getPublic();
			var myOutside = new RSAKey();
			myOutside.setPublic(pub.n_hex, pub.e_hex);
			this.publicKeys[this.myId] = myOutside;

			this.playersDataStore.on("send", (data) => { this.onSend(data); });

			var keysDataStore = this.milkcocoa.dataStore("publicKeys");

			keysDataStore.push({
				userId: this.myId,
				publicKey: pub
			});

			keysDataStore.query().sort("asc").limit(30).done((data) =>
			{
				data.forEach((x) => { this.onRegister(x); });
				keysDataStore.on("push", (data) => { this.onRegister(data.value); });

				this.synchronize("*", []);
				this.loadScoreboard(5);

				callback();
			});
		});
	}
	private onRegister(value: { userId: string; publicKey: RSAPublicKey; }): void
	{
		var outside = new RSAKey();
		outside.setPublic(value.publicKey.n_hex, value.publicKey.e_hex);
		this.publicKeys[value.userId] = outside;

		console.log(["Register", value.userId, value.publicKey.n_hex.toString().substr(0, 16) + ".."].join(" "));
	}
	private enter(name: string): void
	{
		var myself: Player = {
			publicKey: this.MyPublicKey,
			name: name,
			userId: this.myId,
			lastOrder: this.CurrentTime,
			position: (this.DominoCount === 0 ? 0 : this.DominoCount + 1) * Const.DominoInterval,
			velocity: 0,
			state: PlayerState.Normal,
			dominoes: 0,
		};
		this.players[this.myId] = myself;

		if (!this.standalone)
		{
			//this.playersDataStore.set(this.myId, myself);
			this.sendMessage("*", "JOIN", myself);
		}

		this.addPlayer(this.myId, myself);
	}
	public synchronize(oppId: string, timestamps: number[]): void
	{
		var n = timestamps.length;

		timestamps.push(this.CurrentTime);

		if (n < Const.TimeSynchroTime)
		{
			this.sendMessage(oppId, "SYNC", timestamps);

			if (n + 1 < Const.TimeSynchroTime)
				return;
		}

		var dt = [];
		for (var i = 0; i < timestamps.length - 2; i++)
			dt[i] = (i % 2 == 0 ? 1 : -1) * (timestamps[i + 1] - (timestamps[i] + timestamps[i + 2]) / 2);

		this.timeDiff[oppId] = dt.sort()[Math.floor(dt.length / 2)];

		console.log(["time diff", oppId, this.timeDiff[oppId]].join(" "));

		if (n % 2 == 1 && this.Myself)
			this.sendMessage(oppId, "JOIN", this.Myself);
	}
	public Begin(name: string): void
	{
		console.assert(!!name);

		if (!this.standalone)
			this.enter(name);

		window.addEventListener("keydown", (ev) => { this.onKeyDown(ev); });
		window.addEventListener("keyup", (ev) => { this.onKeyUp(ev); });
		window.addEventListener("blur", (ev) => { this.onBlur(ev); });
	}
	public End(): void
	{
		if (!this.standalone)
			this.sendMessage("*", "EXIT", 1);
	}
	private loadScoreboard(limit: number): void
	{
		this.milkcocoa.dataStore("scoreboard")
			.query({ type: "record" }).limit(limit).sort("asc")
			.done((res: { id: string; userId: string; record: ScoreRecord }[]) =>
		{
			res.forEach((data) =>
			{
				this.verifyScore(data.userId, data.id, data.record, (verified) =>
				{
					if (verified)
						this.scoreRecords.push(data.record);
				});
			});
		});
	}
	private verifyScore(id: string, recordId: string, record: ScoreRecord, callback: (verified: boolean) => any): void
	{
		var str = JSON.stringify(record);
		var witnesses = 0;

		this.milkcocoa.dataStore("scoreboard")
			.query({ type: "signature", recordId: recordId })
			.done((res: { userId: string; signature: string }[]) =>
		{
			res.forEach(data =>
			{
				var s = new KJUR.crypto.Signature(Const.SignatureParam);
				s.initVerifyByPublicKey(this.publicKeys[data.userId]);
				s.updateString(str);
				if (s.verify(data.signature))
				{
					witnesses++;
					if (witnesses > record.participants / 2)
						callback(true);
				}
			});

			callback(false);
		});

	}
	public ReadScoreboard(): ScoreRecord[]
	{
		return this.scoreRecords.sort((a, b) => { return b.time - a.time; });
	}
	public AddEventHandler(event: WorldEvent, handler: (player: Player) => void): void
	{
		if (<number> event in this.eventHandlers)
		{
			var oldHnadler = this.eventHandlers[event];
			this.eventHandlers[event] = (arg) =>
			{
				oldHnadler(arg);
				handler(arg);
			};
		}
		else
			this.eventHandlers[event] = handler;
	}

	private accelerate(id: string, dv: number, steady: boolean = false, conserveSign: boolean = false): void
	{
		if (this.fallHandler)
			clearTimeout(this.fallHandler);
		if (conserveSign && this.players[id].velocity === 0)
			return;

		var now = this.CurrentTime;
		var v1 = this.players[id].velocity;

		this.players[id].position += this.players[id].velocity * Const.VelocityRate * (now - this.players[id].lastOrder);
		this.players[id].velocity += dv;
		this.players[id].lastOrder = now;

		if (conserveSign && (this.players[id].velocity === 0 || v1 * this.players[id].velocity < 0))
			this.players[id].velocity = 0;
		else if (!steady && id === this.myId)
			setTimeout(() => { this.accelerate(id, -dv, true, true); },
				Const.PlayerDampingTime[Math.min(Math.abs(this.players[id].velocity), Const.PlayerDampingTime.length - 1)]);

		if (id === this.myId && this.players[id].velocity < 0)
		{
			var t = (-(Const.BridgeLeftSpace + Const.PlayerWidth / 2) - this.players[id].position) / (this.players[id].velocity * Const.VelocityRate);
			this.fallHandler = setTimeout(() => { this.exitPlayer(id); }, t);
		}

		if (!this.standalone && id === this.myId)
		{
			this.sendMessage("*", "MOVE", {
				time: now,
				position: this.Myself.position,
				velocity: this.Myself.velocity
			});
			//this.playersDataStore.set(this.myId, this.Myself);
		}
	}
	private rallentate(id: string): void
	{
		if (this.players[id].velocity === 0)
			return;

		if (this.rall)
			clearTimeout(this.rall);
		this.rall = setTimeout(() =>
		{
			this.accelerate(id, -Util.sign(this.players[id].velocity), true, true);
			this.rallentate(id);
		}, Const.PlayerDampingTime[Math.abs(this.players[id].velocity)]);
	}
	private updatePosition(id: string, remoteTime: number, position: number, velocity: number): void
	{
		var t = this.fixTime(id, remoteTime);
		var dt = t - this.players[id].lastOrder;
		var expected = this.players[id].position + this.players[id].velocity * Const.VelocityRate * dt;

		if (Math.abs(position - expected) > Const.ExpulsionBorder)
		{
			console.log(["x=", position, velocity, " expected=", expected, this.players[id].velocity, " dx=", Math.abs(position - expected)].join(" "));
			this.sendMessage("*,ME", "ACK", {
				originId: id,
				action: "EXPELLED",
				ack: true
			});
		}

		this.players[id].lastOrder = t;
		this.players[id].position = position;
		this.players[id].velocity = velocity;
	}
	private attack(id: string): void
	{
		if (Math.abs(this.players[id].velocity) < 5)
			return;

		if (id === this.myId)
			this.accelerate(id, Util.sign(this.players[id].velocity) * 3);

		this.players[id].state = PlayerState.Attack;

		if (!this.standalone && id === this.myId)
		{
			this.sendMessage("*", "ATTACK", this.Myself);
			//this.playersDataStore.set(this.myId, this.Myself);

			setTimeout(() =>
			{
				var killed = this.findNearbyId(id, Const.AttackRange);
				if (killed.length > 0)
					this.tryAction(id, "KILL", this.CurrentTime, killed, true);
			}, 400);
		}

		this.eventHandlers[WorldEvent.PlayerAttack](this.players[id]);

		setTimeout(() =>
		{
			if (this.players[id].state !== PlayerState.Attack)
				return;

			this.players[id].state = PlayerState.Normal;

			//if (!this.standalone && id === this.myId)
			//	this.playersDataStore.set(this.myId, this.Myself);
		}, 800);
	}
	private findNearbyId(id: string, distance: number): string[]
	{
		var dt = this.CurrentTime - this.players[id].lastOrder;
		var x1 = this.players[id].position + this.players[id].velocity * Const.VelocityRate * dt + Util.sign(this.players[id].velocity) * Const.PlayerHeight / 2;
		var res: string[] = [];

		Object.keys(this.players).forEach((key) =>
		{
			if (key === id || this.players[key].state === PlayerState.Dead)
				return;

			var x2 = this.players[key].position + this.players[key].velocity * Const.VelocityRate * dt;
			if (Math.abs(x1 - x2) < distance)
				res.push(key);
		});

		return res;
	}
	private isNerabyId(id: string, distance: number, targetId: string[]): boolean
	{
		var dt = this.CurrentTime - this.players[id].lastOrder;
		var x1 = this.players[id].position + this.players[id].velocity * Const.VelocityRate * dt + Util.sign(this.players[id].velocity) * Const.PlayerHeight / 2;
		var res: string[] = [];

		targetId.forEach((key) =>
		{
			if (key === id || this.players[key].state === PlayerState.Dead)
				return;

			var x2 = this.players[key].position + this.players[key].velocity * Const.VelocityRate * dt;
			if (Math.abs(x1 - x2) >= distance)
				return false;
		});

		return true;
	}
	private kill(id: string, victimId: string): void
	{
		this.accelerate(victimId, -this.players[victimId].velocity + this.players[id].velocity, true, false);
		this.accelerate(id, -this.players[id].velocity + Util.sign(this.players[id].velocity), true, false);

		this.exitPlayer(victimId);
	}
	private call(id: string): void
	{
		if (this.players[id].velocity > 3
			|| Math.abs(this.players[id].position - this.DominoCount * Const.DominoInterval) > Const.CallRange)
			return;

		if (this.players[id].velocity !== 0)
			this.accelerate(id, -this.players[id].velocity, true, true);

		this.players[id].state = PlayerState.Call;
		this.players[id].dominoes++;

		if (!this.standalone && id === this.myId)
		{
			this.sendMessage("*", "PUT", 1);

			//this.playersDataStore.set(this.myId, this.Myself);
		}
		this.eventHandlers[WorldEvent.PlayerCall](this.players[id]);

		setTimeout(() =>
		{
			if (this.players[id].state !== PlayerState.Call)
				return;

			this.players[id].state = PlayerState.Normal;
			//if (!this.standalone && id === this.myId)
			//	this.playersDataStore.set(this.myId, this.Myself);
		}, 500);
	}
	private push(id: string): void
	{
		var n = this.DominoCount;

		this.players[id].state = PlayerState.Push;
		setTimeout(() =>
		{
			this.players[id].state = PlayerState.Normal;
			this.eventHandlers[WorldEvent.GameEnd](null);
		}, Const.DominoCollapsingBegin + n * Const.DominoCollapsingInterval + Const.DominoCollapsingTime);

		Object.keys(this.players).forEach((key) =>
		{
			if (key !== id)
				this.players[key].state = PlayerState.Lose;
		});

		this.gameEnded = true;

		if (!this.standalone)
		{
			var scoreDataStore = this.milkcocoa.dataStore("scoreboard");

			var record: ScoreRecord = {
				name: this.players[id].name,
				dominoes: n,
				time: this.CurrentTime,
				participants: this.LivingPlayerCount
			};
			var str = JSON.stringify(record);
			if (id === this.myId)
				scoreDataStore.push({
					type: "record",
					userId: this.myId,
					record: record
				}, (data) =>
				{
					this.sendMessage("*,ME", "SCORE", {
						recordId: data.id,
						record: record
					});
				});
		}

		this.eventHandlers[WorldEvent.PlayerPush](this.players[id]);
	}
	private signScore(id: string, recordId: string, record: ScoreRecord): void
	{
		console.log(["signScore", this.gameEnded, this.players[id].state !== PlayerState.Lose,
			record.dominoes === this.DominoCount, record.participants === this.LivingPlayerCount].join(" "));

		if (this.gameEnded
			&& this.players[id].state !== PlayerState.Lose
			&& record.dominoes === this.DominoCount
			&& record.participants === this.LivingPlayerCount)
		{
			var s = new KJUR.crypto.Signature(Const.SignatureParam);
			s.initSign(this.mySecret);
			s.updateString(JSON.stringify(record));
			var signature = s.sign();

			this.milkcocoa.dataStore("scoreboard").push({
				type: "signature",
				userId: this.myId,
				recordId: recordId,
				signature: signature
			});

			this.scoreRecords.push(record);
		}
	}
	private tryAction(id: string, action: string, remoteTime: number, data: any, uncondTrust: boolean = false): boolean
	{
		var trial: ActionTrial = { action: action, time: this.fixTime(id, remoteTime), ack: 0, deny: 0, data: data };

		if (id in this.actionTrial && this.CurrentTime - this.actionTrial[id].time < Const.TrialTime)
			return;

		if (id !== this.myId)
			this.actionTrial[id] = trial;

		if (this.players[id].state === PlayerState.Dead)
			return;

		if (uncondTrust)
		{
			if (id !== this.myId)
				console.error("Nobody but a fool trusts everybody.");
		}
		else
		{
			switch (action)
			{
				case "PUSH":
					if (this.players[id].state !== PlayerState.Normal
						|| this.players[id].velocity !== 0
						|| Math.abs(this.players[id].position - (-1.8)) > Const.PlayerWidth / 2)
						return false;
					break;
				case "KILL":
					if (!this.isNerabyId(id, Const.AttackRange, trial.data))
						return false;
					break;
			}
		}

		if (id === this.myId)
		{
			this.sendMessage("*", action, trial);
			this.actionTrial[id] = trial;
		}

		this.sendMessage("*,ME", "ACK", {
			originId: id,
			action: action,
			ack: true
		});

		return true;
	}
	private ackAction(responseId: string, msg: { originId: string; action: string; ack: boolean }): void
	{
		if (!(msg.originId in this.actionTrial))
		{
			if (msg.action === "EXPELLED")
			{
				this.actionTrial[msg.originId] = {
					time: this.CurrentTime,
					action: msg.action,
					ack: 0,
					deny: 0,
					data: null
				};
			}
			else
				return;
		}

		if (this.CurrentTime > this.actionTrial[msg.originId].time + Const.TrialTime)
		{
			console.log(["trial time over", this.actionTrial[msg.originId].action].join(" "));
			delete this.actionTrial[msg.originId];
			return;
		}

		if (msg.ack && msg.action === this.actionTrial[msg.originId].action)
			this.actionTrial[msg.originId].ack++;
		else
			this.actionTrial[msg.originId].deny++;

		if (this.actionTrial[msg.originId].ack > this.LivingPlayerCount / 2)
		{
			console.log(["trial OK", this.actionTrial[msg.originId].action].join(" "));
			switch (this.actionTrial[msg.originId].action)
			{
				case "EXPELLED":
					this.exitPlayer(msg.originId);
					break;
				case "PUSH":
					this.push(msg.originId);
					break;
				case "KILL":
					(<string[]> this.actionTrial[msg.originId].data).forEach((killed) =>
					{
						this.kill(msg.originId, killed);
					});
					break;
			}
			delete this.actionTrial[msg.originId];
		}
		else if (this.actionTrial[msg.originId].deny > this.LivingPlayerCount / 2)
		{
			delete this.actionTrial[msg.originId];
		}
	}
	private onSend(data: milkcocoa.DataStoreCallbackData): void
	{
		var msg = <Message> data.value;

		if (!(msg.destId === "*,ME"
			|| (msg.destId === "*" && msg.senderId !== this.myId)
			|| msg.destId === this.myId))
		{
			return;
		}

		console.log(["Catch message", msg.senderId, msg.destId, msg.action, msg.signature.substr(0, 8) + ".."].join(" "));

		var signed = this.receiveMessage(msg);
		if (!signed)
		{
			console.log("Forged message!!!");
			return;
		}

		switch (msg.action)
		{
			case "JOIN":
				if (msg.senderId in this.players)
					return;
				console.log(["Find player", msg.senderId].join(" "));
				this.addPlayer(msg.senderId, signed);
				break;
			case "SYNC":
				this.synchronize(msg.senderId, signed);
				break;
			case "MOVE":
				this.updatePosition(msg.senderId, signed.time, signed.position, signed.velocity);
				break;
			case "PUT":
				this.call(msg.senderId);
				break;
			case "ATTACK":
				this.attack(msg.senderId);
				break;
			case "BAN":
			case "PUSH":
			case "KILL":
				var trial = <ActionTrial> signed;
				this.tryAction(msg.senderId, trial.action, trial.time, trial.data);
				break;
			case "SCORE":
				this.signScore(msg.senderId, signed.recordId, signed.record);
				break;
			case "EXIT":
				this.exitPlayer(msg.senderId);
				break;
			case "ACK":
				this.ackAction(msg.senderId, signed);
				break;
		}
	}

	private sendMessage(destId: string, action: string, data: any): void
	{
		var str = JSON.stringify(data) + "@" + this.CurrentTime;
		var s = new KJUR.crypto.Signature(Const.SignatureParam);
		s.initSign(this.mySecret);
		s.updateString(str);
		var signature = s.sign();
			
		var msg: Message = {
			senderId: this.myId,
			destId: destId,
			action: action,
			data: str,
			signature: signature
		};
		this.playersDataStore.send(msg);
	}
	private receiveMessage(msg: Message): any
	{
		if (!msg.signature || !(msg.senderId in this.publicKeys))
			return null;

		var str = <string> msg.data;
		var s = new KJUR.crypto.Signature(Const.SignatureParam);
		s.initVerifyByPublicKey(this.publicKeys[msg.senderId]);
		s.updateString(str);

		if (!s.verify(msg.signature))
			return null;

		var i = str.lastIndexOf("@");

		if (msg.senderId in this.timeDiff)
		{
			var timestamp = this.fixTime(msg.senderId, parseInt(str.substr(i + 1)));
			var now = this.CurrentTime;

			if (msg.senderId in this.lastMessage && timestamp <= this.lastMessage[msg.senderId]
				|| now - timestamp > Const.SignatureAvailTime)
			{
				console.log(["invalid signature from", msg.senderId].join(" "));
				console.debug(["last=", this.lastMessage[msg.senderId], " ts=", timestamp, " now=", now].join(" "));
				return null;
			}

			this.lastMessage[msg.senderId] = timestamp;
		}

		console.log("str : " + str + " " + i);
		return JSON.parse(str.substr(0, i));
	}
	private fixTime(senderId: string, remoteTime: number): number
	{
		if (senderId === this.myId)
			return remoteTime;

		console.assert(senderId in this.timeDiff);

		return remoteTime - this.timeDiff[senderId];
	}
	private addPlayer(id: string, player: Player): void
	{
		this.players[id] = {
			name: player.name,
			userId: player.userId,
			lastOrder: this.fixTime(id, player.lastOrder),
			position: player.position,
			velocity: player.velocity,
			state: player.state,
			dominoes: player.dominoes,
		};
		this.eventHandlers[WorldEvent.PlayerEnter](player);
	}
	private exitPlayer(id: string): void
	{
		if (!(id in this.players) || this.players[id].state === PlayerState.Dead)
			return;

		this.players[id].state = PlayerState.Dead;

		//if (!this.standalone && id === this.myId)
		//	this.playersDataStore.set(id, this.players[id]);

		this.eventHandlers[WorldEvent.PlayerExit](this.players[id]);
	}
	private processKeyDown(key: ControlKey): boolean
	{
		var captured = true;

		switch (key)
		{
			case ControlKey.Delete:
				this.exitPlayer(this.myId);
				break;
			case ControlKey.Space:
				if (this.Myself.state === PlayerState.Normal)
				{
					if (Math.abs(this.Myself.velocity) <= 4)
					{
						if (!this.tryAction(this.myId, "PUSH", this.CurrentTime, 1))
							this.call(this.myId);
					}
					else
						this.attack(this.myId);
				}
				break;
			case ControlKey.Left:
			case ControlKey.Right:
				if (this.Myself.state !== PlayerState.Normal || this.moveKeyPressed)
					break;
				var now = Date.now();
				if (this.rall && (now - this.lastMove) / 1000 < Const.MoveAcceleratableTime)
					clearTimeout(this.rall);
				var d = (key === ControlKey.Left ? -1 : 1);
				this.accelerate(this.myId, d, true);
				this.moveKeyPressed = true;
				break;
			default:
				captured = false;
		}

		return captured;
	}
	private processKeyUp(key: ControlKey): boolean
	{
		var captured = true;

		switch (key)
		{
			case ControlKey.Left:
			case ControlKey.Right:
				this.rallentate(this.myId);
				this.lastMove = Date.now();
				this.moveKeyPressed = false;
				break;
			default:
				captured = false;
		}

		return captured;
	}
	public control(keySymbol: string, stateStr: string): void
	{
		var key: ControlKey;
		switch (keySymbol)
		{
			case "◀": key = ControlKey.Left; break;
			case "▶": key = ControlKey.Right; break;
			case "●": key = ControlKey.Space; break;
			default: return;
		}
		if (stateStr === "down")
			this.processKeyDown(key);
		else if (stateStr === "up")
			this.processKeyUp(key);
	}
	private onKeyDown(ev: KeyboardEvent): void
	{
		if (!this.myId)
			return;

		var key = Keyboard.knowControlKey(ev);

		if (this.processKeyDown(key))
			ev.preventDefault();
	}
	private onKeyUp(ev: KeyboardEvent): void
	{
		if (!this.myId)
			return;

		var key = Keyboard.knowControlKey(ev);

		if (this.processKeyUp(key))
			ev.preventDefault();
	}
	private onBlur(ev: FocusEvent): void
	{
		if (!this.myId)
			return;

		this.rallentate(this.myId);
		this.moveKeyPressed = false;
	}
}
