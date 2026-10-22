import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';

import { Spacing } from '@/theme';

type RevealInput = (input: TextInput | null) => void;

const RevealContext = createContext<RevealInput | null>(null);

/** Lets a text field ask the surrounding KeyboardAwareScrollView to keep it above the keyboard. */
export function useRevealInput() {
  return useContext(RevealContext);
}

const REVEAL_MARGIN = Spacing.xl;

/**
 * ScrollView that keeps the focused text field visible above the software keyboard.
 *
 * With Android edge-to-edge (enabled by React Native) the window no longer resizes
 * for the keyboard, so neither KeyboardAvoidingView nor Android's own
 * "scroll focused field into view" applies. On Android this adds bottom padding
 * equal to the keyboard height and scrolls the focused field into view; on iOS
 * the ScrollView's automatic keyboard insets provide the room.
 */
export function KeyboardAwareScrollView({ children, contentContainerStyle, onScroll, ...rest }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const reveal = useCallback<RevealInput>((input) => {
    const top = keyboardTop.current;
    const scroll = scrollRef.current;
    if (!input || top === null || !scroll) return;
    input.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + REVEAL_MARGIN - top;
      if (overlap > 0) scroll.scrollTo({ y: offset.current + overlap, animated: true });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      // Wait for the extra padding to lay out before measuring.
      setTimeout(() => reveal(TextInput.State.currentlyFocusedInput() as TextInput | null), 60);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        {...rest}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        contentContainerStyle={[
          contentContainerStyle,
          Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight + REVEAL_MARGIN } : null,
        ]}>
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
}
