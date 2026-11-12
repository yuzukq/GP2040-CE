#include "addons/mod_shortcut.h"
#include "storagemanager.h"
#include "GamepadState.h"

// The packed step layout in mod_shortcut_engine.h relies on these values.
static_assert(GAMEPAD_MASK_DU == (1UL << modshortcut::STEP_DPAD_SHIFT), "dpad step bits changed");
static_assert(GAMEPAD_MASK_DR == (1UL << (modshortcut::STEP_DPAD_SHIFT + 3)), "dpad step bits changed");
static_assert(GAMEPAD_MASK_UP == modshortcut::DPAD_UP && GAMEPAD_MASK_DOWN == modshortcut::DPAD_DOWN &&
              GAMEPAD_MASK_LEFT == modshortcut::DPAD_LEFT && GAMEPAD_MASK_RIGHT == modshortcut::DPAD_RIGHT,
              "dpad bits changed");
static_assert(MOD_SHORTCUT_MAX_PRESETS == sizeof(ModShortcutOptions::presets) / sizeof(ModShortcutOptions::presets[0]),
              "MOD_SHORTCUT_MAX_PRESETS must match config.proto");
static_assert(MOD_SHORTCUT_MAX_RULES == sizeof(ModShortcutPreset::rules) / sizeof(ModShortcutPreset::rules[0]),
              "MOD_SHORTCUT_MAX_RULES must match config.proto");
static_assert(MOD_SHORTCUT_MAX_STEPS == sizeof(ModShortcutRule::steps) / sizeof(ModShortcutRule::steps[0]),
              "MOD_SHORTCUT_MAX_STEPS must match config.proto");

bool ModShortcutAddon::available() {
    if (!Storage::getInstance().getAddonOptions().modShortcutOptions.enabled)
        return false;

    GpioMappingInfo* pinMappings = Storage::getInstance().getProfilePinMappings();
    for (Pin_t pin = 0; pin < (Pin_t)NUM_BANK0_GPIOS; pin++) {
        if (pinMappings[pin].action == GpioAction::BUTTON_PRESS_MOD_SHORTCUT)
            return true;
    }
    return false;
}

void ModShortcutAddon::setup() {
    loadPins();
    loadRules();
    engine.reset();
}

void ModShortcutAddon::reinit() {
    // Called after a profile change: the Mod pin may have moved.
    loadPins();
    loadRules();
    engine.reset();
}

void ModShortcutAddon::loadPins() {
    modPinMask = 0;
    GpioMappingInfo* pinMappings = Storage::getInstance().getProfilePinMappings();
    for (Pin_t pin = 0; pin < (Pin_t)NUM_BANK0_GPIOS; pin++) {
        if (pinMappings[pin].action == GpioAction::BUTTON_PRESS_MOD_SHORTCUT)
            modPinMask |= Mask_t{1} << pin;
    }
}

void ModShortcutAddon::loadRules() {
    ruleCount = 0;
    const ModShortcutOptions& options = Storage::getInstance().getAddonOptions().modShortcutOptions;
    if (options.presets_count == 0)
        return;

    const uint32_t presetIndex = options.activePreset < options.presets_count ? options.activePreset : 0;
    const ModShortcutPreset& preset = options.presets[presetIndex];
    for (pb_size_t i = 0; i < preset.rules_count && ruleCount < MOD_SHORTCUT_MAX_RULES; i++) {
        const ModShortcutRule& rule = preset.rules[i];
        rules[ruleCount++] = modshortcut::RuleView{
            rule.enabled,
            rule.mode == ModShortcutMode::MOD_SHORTCUT_HOLD,
            rule.directionMask,
            rule.steps,
            rule.steps_count,
        };
    }
}

void ModShortcutAddon::preprocess() {
    Gamepad* gamepad = Storage::getInstance().GetGamepad();
    const bool modPressed = (gamepad->debouncedGpio & modPinMask) != 0;
    engine.process(modPressed, gamepad->state.dpad, gamepad->state.buttons, getMicro(), rules, ruleCount);
}
