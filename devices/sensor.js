require("../service_functions.js");
let device = require("../device.js");

module.exports = class devSensor extends device {
	constructor(plc, mqtt, config, mqtt_base) {
		super(plc, mqtt, config, mqtt_base);

		// add attributes specific for a sensor
		// create attribute from config

		// state
		if (config.state) {
			// allow all supported types
			this.create_attribute(config.state, "", "state");
			this.attributes["state"].set_RW("r"); // readonly
		}

		// if a boolean address is given,
		// change the type from "sensor" to "binary_sensor"
		if (this.attributes["state"].type === "X") {
			this.type = "binary_sensor";
		}
	}

	send_discover_msg() {
		let info = {
			name: this.name,
		};

		if (this.attributes["state"]) {
			info.state_topic = this.attributes["state"].full_mqtt_topic;

			// if this sensor is binary
			if (this.type === "binary_sensor") {
				info.payload_on = "true";
				info.payload_off = "false";
			}
		}

		// Support home-assistant discover options
		// https://www.home-assistant.io/integrations/mqtt/
		[
			'unit_of_measurement',
			'device_class',
			'value_template',
			'name',
		].forEach((key) => {
			if (this.config[key]) {
				info[key] = this.config[key];
			}
		});

		super.send_discover_msg(info);
	}


}
