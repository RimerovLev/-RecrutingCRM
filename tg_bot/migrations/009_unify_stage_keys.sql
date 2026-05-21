-- Migration 009: унифицировать значения current_stage в candidacies
-- Приводим старые русские строки к единым английским ключам.
-- Старые значения: 'Новый', 'Собеседование', 'Оффер', 'Принят', 'Отказ'
-- Новые значения:  'new',   'interview',      'offer', 'offer',  'rejected'
-- (плюс добавляем 'resume', 'phone' — они не существовали раньше)

UPDATE candidacies SET current_stage = 'new'        WHERE current_stage = 'Новый';
UPDATE candidacies SET current_stage = 'interview'   WHERE current_stage = 'Собеседование';
UPDATE candidacies SET current_stage = 'offer'       WHERE current_stage = 'Оффер';
UPDATE candidacies SET current_stage = 'offer'       WHERE current_stage = 'Принят';
UPDATE candidacies SET current_stage = 'rejected'    WHERE current_stage = 'Отказ';

-- stage_history тоже мигрируем
UPDATE stage_history SET from_stage = 'new'        WHERE from_stage = 'Новый';
UPDATE stage_history SET from_stage = 'interview'   WHERE from_stage = 'Собеседование';
UPDATE stage_history SET from_stage = 'offer'       WHERE from_stage = 'Оффер';
UPDATE stage_history SET from_stage = 'offer'       WHERE from_stage = 'Принят';
UPDATE stage_history SET from_stage = 'rejected'    WHERE from_stage = 'Отказ';

UPDATE stage_history SET to_stage = 'new'        WHERE to_stage = 'Новый';
UPDATE stage_history SET to_stage = 'interview'   WHERE to_stage = 'Собеседование';
UPDATE stage_history SET to_stage = 'offer'       WHERE to_stage = 'Оффер';
UPDATE stage_history SET to_stage = 'offer'       WHERE to_stage = 'Принят';
UPDATE stage_history SET to_stage = 'rejected'    WHERE to_stage = 'Отказ';
