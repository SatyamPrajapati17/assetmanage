// Register all models (order matters only for readability; Mongoose resolves refs lazily).
module.exports = {
  User: require('./User'),
  Department: require('./Department'),
  AssetCategory: require('./AssetCategory'),
  Asset: require('./Asset'),
  Allocation: require('./Allocation'),
  TransferRequest: require('./TransferRequest'),
  Booking: require('./Booking'),
  MaintenanceRequest: require('./MaintenanceRequest'),
  AuditCycle: require('./AuditCycle'),
  AuditItem: require('./AuditItem'),
  Notification: require('./Notification'),
  ActivityLog: require('./ActivityLog'),
  Counter: require('./Counter'),
};
