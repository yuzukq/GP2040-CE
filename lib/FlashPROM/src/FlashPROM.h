/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: Copyright (c) 2021 Jason Skuby (mytechtoybox.com)
 */

#ifndef FLASHPROM_H_
#define FLASHPROM_H_

#include <stdint.h>
#include <string.h>
#include <pico/lock_core.h>
#include <pico/multicore.h>
#include <hardware/flash.h>
#include <hardware/timer.h>

// gp2040-neo: grown from 32k to 40k so that the Mod Shortcut presets fit. The
// region still ends at 0x10200000 and the config is stored right before the
// footer at the very end, so configs written by upstream GP2040-CE are read
// unchanged (and vice versa, as long as the encoded config stays below 32k).
#define EEPROM_SIZE_BYTES    0xA000           // Reserve 40k of flash memory (must be a multiple of the 4k flash sector size)
#define EEPROM_ADDRESS_START _u(0x101F6000)
#define LEGACY_EEPROM_ADDRESS_START _u(0x101F8000) // pre-protobuf configs (config_legacy.cpp) were stored here
static_assert(EEPROM_SIZE_BYTES % 4096 == 0, "EEPROM_SIZE_BYTES must be a multiple of FLASH_SECTOR_SIZE");
static_assert(EEPROM_ADDRESS_START + EEPROM_SIZE_BYTES == 0x10200000, "the config footer must stay at the end of the first 2MB");

// Warning: If the write wait is too long it can stall other processes
#define EEPROM_WRITE_WAIT    50             // Amount of time in ms to wait before blocking core1 and committing to flash

class FlashPROM
{
	public:
		void start();
		void commit();
		void reset();

		static uint8_t writeCache[EEPROM_SIZE_BYTES];
};

inline FlashPROM EEPROM;

#endif
