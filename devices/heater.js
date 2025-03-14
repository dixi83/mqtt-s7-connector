const device = require("../device.js");
const sf = require('../service_functions.js');

/**
 * Heater device
 *
 * The heater device is a simple climate entity that only has current and target temperature.
 * The Mode "heat" and "off" gets derived from a config value "heatMode_temperature_threshold",
 * when the target temperature is above this value, the mode is set to "heat" otherwise to "off".
 */
module.exports = class devHeater extends device {
	constructor(plc, mqtt, config, mqtt_base) {
		super(plc, mqtt, config, mqtt_base);

		// Overwrite the type of the home assistant component because it does not match the device type
		this.ha_component = 'climate';

		// current temperature
		if (config["current_temperature"]) {
			this.create_attribute(config["current_temperature"], this.getDatatype(config['current_temperature']), "current_temperature");
			this.attributes["current_temperature"].set_RW("r");

			// if no update interval is defined, set it to 5 min
			if (this.attributes["current_temperature"].update_interval === 0)
				this.attributes["current_temperature"].update_interval = 300_000;
		}

		// target temperature
		if (config["target_temperature"]) {
			this.create_attribute(config["target_temperature"], this.getDatatype(config['target_temperature']), "target_temperature");
			this.attributes["target_temperature"].set_RW("rw");
		}

		// mode topic
		this.modeStateTopic = this.full_mqtt_topic + "/mode";
		this.lastMode = null;
	}

	/**
	 * Derive the datatype from the plc config
	 */
	getDatatype(plcConfig) {
		const identifier = plcConfig.plc || plcConfig;
		const [,type] = identifier.split(',');
		if(type.startsWith('INT')) {
			return 'INT';
		} else if(type.startsWith('REAL')) {
			return 'REAL';
		}
		throw new Error(`Currently we support only INT and REAL datatypes. Got ${type}`);
	}

	rec_s7_data(attr, data) {
		super.rec_s7_data(attr, data);
		if(attr === 'target_temperature') {
			this.updateMode(data);
		}
	}

	rec_mqtt_data(attr, data) {
		super.rec_mqtt_data(attr, data);
		if(attr === 'target_temperature') {
			this.updateMode(data);
		}
	}

	/**
	 * Update the mode based on the target temperature
	 */
	updateMode(targetTemperature) {
		if(Number.isFinite(targetTemperature)) {
			// Set to heat if target-temp is gt than heatMode_temperature_threshold config value
			const threshold = this.config.heatMode_temperature_threshold || 4;
			const newMode = targetTemperature > threshold ? 'heat' : 'off';
			if (this.lastMode === newMode) return;
			this.lastMode = newMode;
			sf.debug(`Setting mode to ${newMode} based on target temperature ${targetTemperature}, threshold ${threshold}`);
			this.lastMode = newMode;
			this.mqtt_handler.publish(this.modeStateTopic, newMode, {retain: true});
			// HA updates the widget with current values on any mqtt messages
			// We publish back the target_temperature before reading it from the PLC to avoid flickering
			this.mqtt_handler.publish(this.attributes["target_temperature"].full_mqtt_topic, targetTemperature.toString(), {retain: true});
		}
	}

	send_discover_msg() {
		let info = {
			name: this.name,
			modes: ['off', 'heat'],
			mode_state_topic: this.modeStateTopic,
			mode_state_template: "{{ value }}", // Overwrite a potential set value_template to be able to publish raw strings
		};

		if (this.attributes["current_temperature"]) {
			info.current_temperature_topic = this.attributes["current_temperature"].full_mqtt_topic;
		}

		if (this.attributes["target_temperature"]) {
			// add only temperature_command_topic if the attribute is allowed to write
			if (this.attributes["target_temperature"].write_to_s7)
				info.temperature_command_topic = this.attributes["target_temperature"].full_mqtt_topic + "/set";

			// add only temperature_state_topic if attribute is allowed to read
			if (this.attributes["target_temperature"].publish_to_mqtt)
				info.temperature_state_topic = this.attributes["target_temperature"].full_mqtt_topic;
		}

		// Support home-assistant discover options
		// https://www.home-assistant.io/integrations/mqtt/
		[
			'device_class',
			'value_template',
			'current_temperature_template',
			'temperature_command_template',
			'name',
			'min_temp',
			'max_temp',
			'temp_step'
		].forEach((key) => {
			if(this.config[key]) {
				info[key] = this.config[key];
			}
		});

		super.send_discover_msg(info);
	}


}
