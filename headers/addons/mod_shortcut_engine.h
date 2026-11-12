#ifndef _ModShortcutEngine_H
#define _ModShortcutEngine_H

// gp2040-neo: hardware independent core of the Mod Shortcut add-on.
//
// The engine looks at the lever direction at the moment the Mod button is
// pressed and picks the first enabled rule whose direction mask contains that
// direction (numpad notation, 5 = neutral). A rule either plays a short input
// sequence (e.g. 6 2 3 + X) or holds an input while Mod stays pressed
// (e.g. L3 for Drive Parry).
//
// This file must not depend on the Pico SDK or on generated protobuf code so
// that it can be unit tested on the host (see tests/mod_shortcut).

#include <stddef.h>
#include <stdint.h>

namespace modshortcut {

// Gamepad masks, kept identical to headers/gamepad/GamepadState.h
constexpr uint8_t DPAD_UP    = 1U << 0;
constexpr uint8_t DPAD_DOWN  = 1U << 1;
constexpr uint8_t DPAD_LEFT  = 1U << 2;
constexpr uint8_t DPAD_RIGHT = 1U << 3;

// A packed step is (frames << STEP_FRAMES_SHIFT) | inputMask.
// inputMask bits 0-15 are GAMEPAD_MASK_B1..A4, bits 16-19 GAMEPAD_MASK_DU/DD/DL/DR.
constexpr uint32_t STEP_INPUT_MASK   = 0x000FFFFFu;
constexpr uint32_t STEP_BUTTON_MASK  = 0x0000FFFFu;
constexpr uint32_t STEP_DPAD_SHIFT   = 16;
constexpr uint32_t STEP_FRAMES_SHIFT = 20;
constexpr uint32_t STEP_FRAMES_MAX   = 0xFF;

// One frame at 60 fps, in microseconds.
constexpr uint32_t FRAME_US = 16667;

constexpr uint32_t packStep(uint32_t inputMask, uint32_t frames) {
    return ((frames > STEP_FRAMES_MAX ? STEP_FRAMES_MAX : frames) << STEP_FRAMES_SHIFT) | (inputMask & STEP_INPUT_MASK);
}

constexpr uint32_t stepFrames(uint32_t step) {
    // 0 frames is treated as 1 so that a step can never be skipped entirely.
    return ((step >> STEP_FRAMES_SHIFT) & STEP_FRAMES_MAX) == 0 ? 1 : ((step >> STEP_FRAMES_SHIFT) & STEP_FRAMES_MAX);
}

constexpr uint8_t stepDpad(uint32_t step) {
    return static_cast<uint8_t>((step >> STEP_DPAD_SHIFT) & 0x0F);
}

constexpr uint32_t stepButtons(uint32_t step) {
    return step & STEP_BUTTON_MASK;
}

constexpr uint32_t directionBit(uint8_t numpad) {
    return 1u << numpad;
}

// Converts a dpad bit mask to numpad notation (1-9, 5 = neutral).
// Opposing directions (SOCD) cancel out on that axis.
inline uint8_t numpadDirection(uint8_t dpad) {
    const bool up = dpad & DPAD_UP;
    const bool down = dpad & DPAD_DOWN;
    const bool left = dpad & DPAD_LEFT;
    const bool right = dpad & DPAD_RIGHT;
    int h = (left == right) ? 0 : (left ? -1 : 1);
    int v = (up == down) ? 0 : (up ? 1 : -1);
    return static_cast<uint8_t>(5 + h + 3 * v);
}

struct RuleView {
    bool enabled;
    bool hold;              // true: MOD_SHORTCUT_HOLD, false: MOD_SHORTCUT_SEQUENCE
    uint32_t directionMask; // bit n = numpad direction n
    const uint32_t* steps;
    size_t stepCount;
};

class Engine {
public:
    enum class Mode : uint8_t { IDLE, SEQUENCE, HOLD };

    void reset() {
        mode = Mode::IDLE;
        prevModPressed = false;
        active = nullptr;
        stepIndex = 0;
        stepStartUs = 0;
    }

    // Finds the first enabled rule for a numpad direction, or nullptr.
    static const RuleView* findRule(const RuleView* rules, size_t ruleCount, uint8_t numpad) {
        for (size_t i = 0; i < ruleCount; i++) {
            const RuleView& rule = rules[i];
            if (rule.enabled && rule.stepCount > 0 && (rule.directionMask & directionBit(numpad))) {
                return &rule;
            }
        }
        return nullptr;
    }

    // Runs once per input poll, before SOCD cleaning. dpad/buttons hold the
    // physical state on entry and the state to report on exit.
    void process(bool modPressed, uint8_t& dpad, uint32_t& buttons, uint64_t nowUs,
                 const RuleView* rules, size_t ruleCount) {
        const bool newPress = modPressed && !prevModPressed;
        prevModPressed = modPressed;

        // A running sequence always finishes, so ignore presses until then.
        if (newPress && mode != Mode::SEQUENCE) {
            const RuleView* rule = findRule(rules, ruleCount, numpadDirection(dpad));
            if (rule != nullptr) {
                active = rule;
                stepIndex = 0;
                stepStartUs = nowUs;
                mode = rule->hold ? Mode::HOLD : Mode::SEQUENCE;
            } else {
                mode = Mode::IDLE;
            }
        }

        if (mode == Mode::HOLD) {
            if (!modPressed) {
                mode = Mode::IDLE;
                active = nullptr;
            } else {
                // Additive: the lever and the other buttons keep working.
                dpad |= stepDpad(active->steps[0]);
                buttons |= stepButtons(active->steps[0]);
            }
        }

        if (mode == Mode::SEQUENCE) {
            // Advance by elapsed time. Using stepStartUs += duration keeps the
            // total length exact even if a poll is late.
            while (nowUs - stepStartUs >= static_cast<uint64_t>(stepFrames(active->steps[stepIndex])) * FRAME_US) {
                stepStartUs += static_cast<uint64_t>(stepFrames(active->steps[stepIndex])) * FRAME_US;
                if (++stepIndex >= active->stepCount) {
                    mode = Mode::IDLE;
                    active = nullptr;
                    break;
                }
            }
            if (mode == Mode::SEQUENCE) {
                // Exclusive: the held lever (e.g. guarding with 4) and other
                // buttons must not leak into the motion.
                dpad = stepDpad(active->steps[stepIndex]);
                buttons = stepButtons(active->steps[stepIndex]);
            }
        }
    }

    Mode getMode() const { return mode; }
    size_t getStepIndex() const { return stepIndex; }

private:
    Mode mode = Mode::IDLE;
    bool prevModPressed = false;
    const RuleView* active = nullptr;
    size_t stepIndex = 0;
    uint64_t stepStartUs = 0;
};

} // namespace modshortcut

#endif // _ModShortcutEngine_H
