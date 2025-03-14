const attribute = require("./attribute.js");
const sf = require('./service_functions.js');
const appConfigHandler = require('./config_handler');
const appConfig = appConfigHandler.config();

module.exports = class device {
	constructor(plc, mqtt, config) {
		this.plc_handler = plc;
		this.mqtt_handler = mqtt;

		this.name = config["mqtt_base"] + "_" + config["name"] || config["mqtt_base"] + "_" + "unnamed device";
		this.config = config;

		this.discovery_topic = "homeassistant";
		this.discovery_retain = appConfig.discovery_retain || false;
		this.type = config["type"].toLowerCase();
		this.ha_component = this.type; // default is the type but can be overwritten

		// device topics
		this.mqtt_name = config["mqtt"];
		this.full_mqtt_topic = config["mqtt_base"] + "/" + this.mqtt_name;

		// store all attribute objects in this array
		this.attributes = {};
	}

	create_attribute(config, required_type, name) {
		// create attribute object
		let new_attribute = new attribute(
			this.plc_handler,
			this.mqtt_handler,
			name,
			required_type,
			this.full_mqtt_topic);

		// the config could be an object
		// or simply a string
		if (typeof config == "object") {
			new_attribute.plc_address = config["plc"];

			// optional different set address
			if (config["set_plc"])
				new_attribute.plc_set_address = config["set_plc"];

			// optional Read/Write config
			if (config["rw"])
				new_attribute.set_RW(config["rw"]);

			// optional update_interval
			if (config["update_interval"])
				new_attribute.update_interval = config["update_interval"];

			// optionally inverted, works only with booleans
			if (config["inverted"])
				new_attribute.boolean_inverted = config["inverted"];

			// optional unit_of_measurement only for homeassistant
			if (config["unit_of_measurement"])
				new_attribute.unit_of_measurement = config["unit_of_measurement"];

			// optional write back changes from plc to set_plc
			if (config["write_back"])
				new_attribute.write_back = config["write_back"];
		} else {
			new_attribute.plc_address = config;
		}

		// register the attribute to the plc library
		new_attribute.subscribePlcUpdates();

		let type;
		if(new_attribute.plc_address.startsWith('DB')) {
			// split the plc address to get the type
			let offset = new_attribute.plc_address.split(',');
			let params = offset[1].match(/(\d+|\D+)/g);
			type = params[0];

			// check if the type is correct
			// and if it isn't, then print some infos
			if(required_type !== "" && type !== required_type) {
				sf.debug("Wrong datatype '" + type + "' at attribute '" + name + "'");

				let numbers = "";
				for(let i = 1; i < params.length; i++) {
					numbers += params[i];
				}

				sf.debug("Did you mean " + offset[0] + "," +
					required_type + numbers +
					" instead of " + new_attribute.plc_address + " ?");

				return;
			}
		} else if(new_attribute.plc_address.startsWith('M')) {
			const parts = new_attribute.plc_address.match(/^(M[A-Z]?)(.*)/);
			if(!parts) {
				sf.debug("Invalid memory address '" + new_attribute.plc_address + "' at attribute '" + name + "'");
				return;
			}
			const memoryType = parts[1];
			// const memoryOffset = parts[2];
			switch(memoryType) {
				case 'MW': // 16-bit int
				case 'MI': // 16-bit int
				case 'MB': // 8-bit int
				case 'MD': // 16-bit int
					type = 'INT';
					break;
				case 'M': // 1-bit bool
					type = 'X';
					break;
				case 'MR':
					type = 'REAL';
					break;
				default:
					sf.debug("Invalid memory type '" + memoryType + "' at attribute '" + name + "'");
					return;
			}
			if(required_type !== "" && type !== required_type) {
				sf.debug("Wrong datatype '" + type + "' at attribute '" + name + "', expected '" + required_type + "'");
				return;
			}
		}

		new_attribute.type = type;


		sf.debug("- New attribute '" + new_attribute.full_mqtt_topic + "' was created");

		// save attribute in an array
		this.attributes[name] = new_attribute;
	}

	send_discover_msg(info) {
		// create a topic in which the discovery message can be sent
		let topic = this.discovery_topic + "/" +
			this.ha_component + "/" +
			this.config["mqtt_base"] + "/" +
			this.mqtt_name + "/config";

		info.unique_id = this.config["mqtt_base"] + "_" + this.mqtt_name;

		info.origin = this.config["origin"];

		if (this.config["device_name"] !== undefined) {
			info.device = {
				name: this.config["device_name"],
				identifiers: [
					this.config["device_identifier"]
				]
			};
			if(this.config["manufacturer"]) {
				info.device.manufacturer = this.config["manufacturer"];
			}
		}

		this.mqtt_handler.publish(topic, JSON.stringify(info), {
			retain: this.discovery_retain
		});
	}

	rec_s7_data(attr, data) {
		// check if the attribute with this name exists
		if (this.attributes[attr]) {

			// forward all data to attribute
			this.attributes[attr].rec_s7_data(data);
		}
	}

	rec_mqtt_data(attr, data, cb) {
		// check if the attribute with this name exists
		if (this.attributes[attr]) {

			// forward all data to attribute
			this.attributes[attr].rec_mqtt_data(data, cb);
		}
	}

	get_plc_address(attr) {
		if (this.attributes[attr] && this.attributes[attr].plc_address) {
			return this.attributes[attr].plc_address;
		}

		return null;
	}

	get_plc_set_address(attr) {
		if (this.attributes[attr]) {
			if (this.attributes[attr].plc_set_address) {
				return this.attributes[attr].plc_set_address;
			} else if (this.attributes[attr].plc_address) {
				return this.attributes[attr].plc_address;
			}
		}

		return null;
	}

}
