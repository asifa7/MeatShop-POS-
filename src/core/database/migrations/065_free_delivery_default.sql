-- Set default delivery zone charge to 0 (Free Home Delivery)
UPDATE delivery_zones SET delivery_charge_paise = 0 WHERE is_default = 1 OR code = 'DEFAULT';
