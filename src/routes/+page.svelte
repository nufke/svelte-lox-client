<script lang="ts">
	import LoxClient from '$lib/LoxClient';
	import { LogLevel } from '$lib/Utils/Logger';

	let hostname: string = '';
	let username: string = '';
	let password: string = '';
	let deviceId: string = '1234'; // dummy App ID
	let client: LoxClient;

	function validate() {
		if(hostname.length && username.length && password.length) {
			connect();
		} else {
			console.log('some fields are empty');
		}
	}

	async function connect() {
		// instantiate the client
		client = new LoxClient(hostname, username, password, deviceId, {logLevel: LogLevel.DEBUG});

		// subscribe to basic events
		client.on('connected', () => {
			console.info('test: Client connected');
		});

		client.on('disconnected', () => {
			console.info('test: Client disconnected');
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		client.on('error', (error: any) => {
			console.error(`test: Client error: ${error.message}`, error);
		});

		// initiate connection
		console.info('test: Client connecting to Miniserver...');
		await client.connect();

		// check client state
		console.info('test: Client state:', client.state);

		// gets acquired token
		const token = client.auth.tokenHandler.token;
		console.info('test: Token received:', token);

		// get structure file
		console.info('test: Get structure file...');
		client.getStructureFile();
		client.parseStructureFile();

		// initiates streaming of events
		//console.info('test: Enable updates...');
		//await client.enableUpdates();

		// sets a switch to on
		//await client.control("90f7abe3-8772-476d-b1dd-a5c1c4cf1ed9", "on");

		// subscribe to value updates
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		client.on("event_value", (event: any) => {
			let detail = {
				uuid: event.detail.uuid.stringValue,
				stateName: event.detail.state?.name,
				value: event.detail.value,
				roomName: event.detail.state?.parentControl?.room?.name,
				controlName: event.detail.state?.parentControl?.name,
				eventPath: event.detail.toPath(),
			}
			console.info('test: Received value event', detail);
		});

		client.on("event_text", (event: any) => {
			let detail = {
				uuid: event.detail.uuid.stringValue,
				stateName: event.detail.state?.name,
				value: event.detail.text,
				roomName: event.detail.state?.parentControl?.room?.name,
				controlName: event.detail.state?.parentControl?.name,
				eventPath: event.detail.toPath(),
			}
			console.info('test: Received text event', detail);
		});

		// disconnects and kills token
 		console.info('test: Disconnect client after 5 seconds...');
		setTimeout( async() => {
			await client.disconnect();
		}, 5000);
	}
	
	async function disconnect() {
		console.info('test: Disconnect client...');
		await client.disconnect();
	}

</script>

<p><b>TEST: Connect to Loxone Miniserver using WebSocket</b></p>
<form onsubmit={validate}>
	<fieldset>
		<label>
			<span>IP address:port</span>
			<input type="text" bind:value={hostname} placeholder="IP address" />
		</label>
		<br>
		<label>
			<span>Username</span>
			<input class="input" type="text" bind:value={username} placeholder="Username" autocomplete="" />
		</label>
		<br>
		<label>
			<span>Password</span>
			<input class="input" type="password" bind:value={password} placeholder="Password" autocomplete="" />
		</label>
	</fieldset>
	<fieldset>
		<button type="submit">Connect</button>
	</fieldset>
</form>
<button type="button" onclick={disconnect}>Disconnect</button>
<p><i>Check console / DevTools for connection details</i></p>
