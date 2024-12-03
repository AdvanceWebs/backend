const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AppSettings = sequelize.define("AppSetting", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  settingKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  settingValue: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = AppSettings;
