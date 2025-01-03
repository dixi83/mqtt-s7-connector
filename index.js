#!/usr/bin/env node
'use strict';

// imports
let mqtt_handler = require('./mqtt_handler');
let plc_handler = require('./plc');
let config_handler = require('./config_handler')
const validateConfig = require('./config_validator');
let sf = require('./service_functions');
let device_factory = require('./device_factory');

let config = config_handler.config();
validateConfig(config);
let mqtt = mqtt_handler.setup(config.mqtt, mqttMsgParser, init);
let plc = plc_handler.setup(config.plc, init);

let devices = [];

function init() {
	if (mqtt_handler.isConnected() && plc_handler.isConnected()) {
		sf.debug("Initialize application");

		// set default config values if they arent set
		config.update_time = config.update_time || 1000; // 1 second
		config.temperature_interval = config.temperature_interval || 300000; // 300 seconds or 5 minutes

		config.mqtt_base = config.mqtt_base || "s7";
		config.mqtt_device_name = config.mqtt_device_name || "plc";
		config.retain_messages = config.retain_messages || false;

		config.discovery_prefix = config.discovery_prefix || "homeassistant";
		config.discovery_retain = config.discovery_retain || false;

		// namespace translation
		plc.setTranslationCB((topic) => {
			let topic_parts = topic.split('/');

			// call a correct device and ask for address from attribute
			if (topic_parts[3] === "set") {
				return devices[topic_parts[1]].get_plc_set_address(topic_parts[2]);
			} else {
				return devices[topic_parts[1]].get_plc_address(topic_parts[2]);
			}
		});

		// parse config and create devices
		if (config.devices !== undefined) {

			// create for each config entry an object
			// and save it to the array
			config.devices.forEach((dev) => {
				let new_device = device_factory(devices, plc, mqtt, dev, config.mqtt_base + "_" + config.mqtt_device_name);

				// perform a discovery message
				new_device.discovery_topic = config.discovery_prefix;
				new_device.send_discover_msg();

				// save the new device in the array
				// with the mqtt base as the index
				devices[new_device.mqtt_name] = new_device;

				sf.debug("New device added: " + config.mqtt_base + "_" + config.mqtt_device_name + "/" + new_device.mqtt_name);
			});
		} else {
			sf.error("No devices in config found !");
		}


		// start loop
		setInterval(() => {
			plc_update_loop();
		}, config.update_time);

		// discovery broadcast loop
		setInterval(() => {
			for (let dev in devices) {
				devices[dev].send_discover_msg();
			}
		}, 300000); // 5 min

	} else {
		setTimeout(() => {
			if (!mqtt_handler.isConnected() || !plc_handler.isConnected()) {
				sf.error("Connection Timeout");
			}
		}, 5000)
	}
}

function mqttMsgParser(topic, msg) {
	let topic_parts = topic.split('/');

	// check if the topic is in the mqtt_base
	if (topic_parts[0] === config.mqtt_base + "_" + config.mqtt_device_name) {
		let device = topic_parts[1];
		let attribute = topic_parts[2];

		// if device exists
		if (devices[device]) {

			// give all data to a device
			devices[device].rec_mqtt_data(attribute, msg);
		}
	}
}


function plc_update_loop() {
	plc.readAllItems((err, readings) => {
		if (err) {
			sf.debug("Error while reading from PLC !");
			return;
		}

		// publish all data
		for (let topic in readings) {
			let topic_parts = topic.split('/');
			let device = topic_parts[1];
			let attribute = topic_parts[2];

			// if device exists
			if (devices[device]) {
				// give all data to a device
				devices[device].rec_s7_data(attribute, readings[topic]);
			}
		}

	});
}
