<script lang="ts">
	import LoxClient from '$lib/LoxClient';
	import { page } from '$app/state';
	import { LogLevel } from '$lib/Utils/Logger';

	async function test() {
		// instantiate the client
		const host = page.data.MS_HOST;
		const username = page.data.MS_USERNAME;
		const password = page.data.MS_PASSWORD;
		const deviceId = page.data.APP_ID;
		let client = new LoxClient(host, username, password, deviceId, {logLevel: LogLevel.DEBUG});

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
		console.info('test: Client connecting to miniserver...');
		await client.connect();

		// gets acquired token
		const token = client.auth.tokenHandler.token;
		console.info('test: Token received:', token);

		// disconnects and skips invalidation of token
		console.info('test: Disconnect miniserver...');
		await client.disconnect(true);

		// reconnect websocket and use supplied token for auth instead of acquiring a new one
		// since we use the token, we keep the password empty. Due to this, token renewal
		// cannot be 
		console.info('test: Connect to miniserver using token...');
		client = new LoxClient(host, username, '', deviceId);
		await client.connect(token);

		// get structure file
		console.info('test: Get structure file...');
		client.getStructureFile();
		client.parseStructureFile();

		// initiates streaming of events
		console.info('test: Enable updates...');
		await client.enableUpdates();

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

	test();
</script>

<p>Check console / DevTools for the results</p>
