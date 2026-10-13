-- Custom SQL migration file, put your code below! --
UPDATE `accounts` SET `opening_date` = (SELECT `principal_as_of` FROM `mortgage_terms` WHERE `mortgage_terms`.`account_id` = `accounts`.`id`) WHERE `opening_date` IS NULL AND EXISTS (SELECT 1 FROM `mortgage_terms` WHERE `mortgage_terms`.`account_id` = `accounts`.`id`);
