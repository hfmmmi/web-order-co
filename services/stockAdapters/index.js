const stockService = require("../stockService");
const BaseAdapter = require("./baseAdapter");
const CsvAdapter = require("./csvAdapter");
const RestAdapter = require("./restAdapter");
const ManualAdapter = require("./manualAdapter");

const adapterRegistry = {
    csv: CsvAdapter,
    rest: RestAdapter,
    manual: ManualAdapter
};

function createAdapter(config = {}, service = stockService) {
    const type = (config.type || "manual").toLowerCase();
    const AdapterClass = adapterRegistry[type];
    if (!AdapterClass) {
        return null;
    }
    return new AdapterClass(config, service);
}

module.exports = {
    BaseAdapter,
    CsvAdapter,
    RestAdapter,
    ManualAdapter,
    createAdapter
};
