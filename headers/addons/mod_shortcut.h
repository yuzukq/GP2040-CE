#ifndef _ModShortcut_H
#define _ModShortcut_H

// gp2040-neo: direction-aware Mod button shortcuts.
// See headers/addons/mod_shortcut_engine.h for the behaviour.

#include "gpaddon.h"
#include "GamepadEnums.h"
#include "config.pb.h"
#include "addons/mod_shortcut_engine.h"

#define ModShortcutName "Mod Shortcut"

#define MOD_SHORTCUT_MAX_PRESETS 8
#define MOD_SHORTCUT_MAX_RULES 6
#define MOD_SHORTCUT_MAX_STEPS 10

class ModShortcutAddon : public GPAddon {
public:
    virtual bool available();
    virtual void setup();
    virtual void preprocess();
    virtual void process() {}
    virtual void postprocess(bool sent) {}
    virtual void reinit();
    virtual std::string name() { return ModShortcutName; }
private:
    void loadPins();
    void loadRules();

    Mask_t modPinMask = 0;
    modshortcut::RuleView rules[MOD_SHORTCUT_MAX_RULES];
    size_t ruleCount = 0;
    modshortcut::Engine engine;
};

#endif // _ModShortcut_H
